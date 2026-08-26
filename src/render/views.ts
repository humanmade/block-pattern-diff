import { displayName, type BlockNode } from '../lib/blocks';
import { formatValue, type AttrRow } from '../lib/attrDiff';
import { flattenRows, type MergedRow } from '../lib/merge';
import type { NodeDiff, TreeDiff } from '../lib/treeDiff';
import { wordDiff } from '../lib/wordDiff';
import { el } from './dom';

export interface ViewOptions {
	showUnchanged: boolean;
	showAllAttrs: boolean;
}

const GUTTER: Record< string, string > = {
	added: '+',
	removed: '−',
	changed: '~',
	unchanged: '·',
};

export function renderUnified(
	rows: MergedRow[],
	diff: TreeDiff,
	options: ViewOptions
): HTMLElement {
	const build = ( list: MergedRow[] ): HTMLElement | null => {
		const visible = list.filter( ( row ) => options.showUnchanged || hasChanges( row ) );
		if ( ! visible.length ) {
			return null;
		}
		const tree = el( 'ul', 'tree' );
		for ( const row of visible ) {
			const item = el( 'li', `row row--${ statusClass( row ) }` );
			if ( row.pairKey ) {
				item.dataset.pair = row.pairKey;
			}

			const children = row.kind === 'moved-out' ? null : build( row.children );
			const head = el( 'div', 'row__head' );
			if ( children ) {
				const twisty = el( 'button', 'twisty', '▾' );
				twisty.type = 'button';
				twisty.setAttribute( 'aria-label', 'Collapse block' );
				twisty.addEventListener( 'click', () => item.classList.toggle( 'is-collapsed' ) );
				head.append( twisty );
			} else {
				head.append( el( 'span', 'twisty twisty--empty' ) );
			}
			head.append( ...headParts( row ) );
			item.append( head );

			if ( row.kind !== 'moved-out' ) {
				const detail = details( row.diff, diff, options );
				if ( detail ) {
					item.append( detail );
				}
			}
			if ( children ) {
				item.append( children );
			}
			tree.append( item );
		}
		return tree;
	};

	return build( rows ) ?? emptyState( 'No changes to show.' );
}

export function renderSideBySide( rows: MergedRow[], options: ViewOptions ): HTMLElement {
	const grid = el( 'div', 'sbs' );
	grid.append( el( 'div', 'sbs__head', 'Before' ), el( 'div', 'sbs__head', 'After' ) );

	const visible = flattenRows( rows ).filter(
		( row ) => options.showUnchanged || row.diff.status !== 'unchanged' || row.diff.move
	);
	if ( ! visible.length ) {
		return emptyState( 'No changes to show.' );
	}

	for ( const row of visible ) {
		// A re-parented block sits in different places on the two sides, so it
		// occupies the left column at its stub row and the right column here.
		const leftNode = row.kind === 'added' || isReparented( row ) ? null : row.diff.before;
		const rightNode = row.kind === 'removed' || row.kind === 'moved-out' ? null : row.diff.after;

		grid.append( cell( row, 'before', leftNode ), cell( row, 'after', rightNode ) );
	}
	return grid;
}

function cell( row: MergedRow, side: 'before' | 'after', node: BlockNode | null ): HTMLElement {
	const container = el( 'div', `cell cell--${ side } cell--${ statusClass( row ) }` );
	if ( row.pairKey ) {
		container.dataset.pair = row.pairKey;
	}
	if ( ! node ) {
		container.classList.add( 'cell--empty' );
		return container;
	}
	container.style.setProperty( '--depth', String( node.depth ) );
	container.append( ...headParts( row, node ) );

	const changed = row.diff.attrs.filter( ( attr ) => attr.status !== 'unchanged' );
	if ( changed.length ) {
		container.append(
			el(
				'span',
				'cell__attrs',
				changed.map( ( attr ) => attr.path ).join( ', ' )
			)
		);
	}
	return container;
}

function headParts( row: MergedRow, only?: BlockNode | null ): Node[] {
	const node = only ?? row.diff.after ?? row.diff.before;
	if ( ! node ) {
		return [];
	}
	const parts: Node[] = [
		el( 'span', 'gutter', row.kind === 'moved-out' ? '↳' : GUTTER[ row.diff.status ] ),
		el( 'span', 'block', displayName( node ) ),
	];
	if ( node.label ) {
		parts.push( el( 'span', 'label', node.label ) );
	}
	const note = moveNote( row );
	if ( note ) {
		parts.push( el( 'span', 'note note--move', note ) );
	}
	if ( node.truncatedStart || node.truncatedEnd ) {
		parts.push(
			el( 'span', 'note note--truncated', 'extends beyond the pasted hunk' )
		);
	}
	// The stub is a pointer, not the block; its markup change shows at the new location.
	if ( row.diff.htmlChanged && ! only && row.kind !== 'moved-out' ) {
		parts.push( el( 'span', 'note note--markup', 'markup' ) );
	}
	return parts;
}

function moveNote( row: MergedRow ): string | null {
	if ( row.kind === 'moved-out' ) {
		return `moved to ${ where( row.diff.after ) }`;
	}
	if ( row.diff.move === 'reparent' ) {
		return `moved here from ${ where( row.diff.before ) }`;
	}
	if ( row.diff.move === 'reorder' ) {
		return 'reordered';
	}
	return null;
}

/** Describes a node's parent in the words a pattern author would use. */
function where( node: BlockNode | null ): string {
	const parent = node?.parent;
	if ( ! parent ) {
		return 'the top level';
	}
	return parent.label ? `${ displayName( parent ) } "${ parent.label }"` : displayName( parent );
}

function details( nodeDiff: NodeDiff, diff: TreeDiff, options: ViewOptions ): HTMLElement | null {
	const rows = options.showAllAttrs
		? nodeDiff.attrs
		: nodeDiff.attrs.filter( ( attr ) => attr.status !== 'unchanged' );

	const container = el( 'div', 'detail' );
	if ( rows.length ) {
		container.append(
			el( 'ul', 'attrs', ...rows.map( ( attr ) => attrRow( attr, nodeDiff, diff ) ) )
		);
	}
	if ( nodeDiff.htmlChanged && nodeDiff.before && nodeDiff.after ) {
		container.append( markupDiff( nodeDiff.before.html, nodeDiff.after.html ) );
	}
	return container.childElementCount ? container : null;
}

function attrRow( attr: AttrRow, nodeDiff: NodeDiff, diff: TreeDiff ): HTMLElement {
	const owner = attr.status === 'removed' ? nodeDiff.before : nodeDiff.after ?? nodeDiff.before;
	const move = owner ? diff.attrMoveIndex.get( `${ owner.id }|${ attr.path }` ) : undefined;

	const item = el(
		'li',
		`attr attr--${ attr.status }`,
		el( 'span', 'attr__path', attr.path )
	);

	if ( attr.status === 'changed' ) {
		item.append(
			el( 'span', 'attr__value attr__value--old', formatValue( attr.before ) ),
			el( 'span', 'attr__arrow', '→' ),
			el( 'span', 'attr__value attr__value--new', formatValue( attr.after ) )
		);
	} else {
		const value = attr.status === 'removed' ? attr.before : attr.after;
		item.append( el( 'span', 'attr__value', formatValue( value ) ) );
	}

	if ( move ) {
		const isSource = owner === move.from;
		const target = isSource ? move.to : move.from;
		const verb = move.kind === 'moved' ? 'moved' : 'retargeted';
		item.append(
			el(
				'span',
				'note note--attrmove',
				`${ verb } ${ isSource ? 'to' : 'from' } ${ describe( target ) }`
			)
		);
	}
	return item;
}

function describe( node: BlockNode ): string {
	return node.label ? `${ displayName( node ) } "${ node.label }"` : displayName( node );
}

function markupDiff( before: string, after: string ): HTMLElement {
	const code = el( 'code', 'markup__code' );
	for ( const op of wordDiff( before, after ) ) {
		code.append(
			op.kind === 'same' ? document.createTextNode( op.text ) : el( 'span', `w w--${ op.kind }`, op.text )
		);
	}
	return el( 'div', 'markup', el( 'span', 'markup__label', 'markup' ), code );
}

function statusClass( row: MergedRow ): string {
	if ( row.kind === 'moved-out' ) {
		return 'movedout';
	}
	if ( row.diff.move && row.diff.status === 'unchanged' ) {
		return 'moved';
	}
	return row.diff.status;
}

function isReparented( row: MergedRow ): boolean {
	return row.kind === 'pair' && row.diff.move === 'reparent';
}

function hasChanges( row: MergedRow ): boolean {
	if ( row.diff.status !== 'unchanged' || row.diff.move ) {
		return true;
	}
	return row.children.some( hasChanges );
}

function emptyState( message: string ): HTMLElement {
	return el( 'p', 'empty', message );
}
