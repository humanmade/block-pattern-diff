import { parse } from '@wordpress/block-serialization-default-parser';
import { balance } from './balance';
import { hash, normalizeWhitespace, stableStringify } from './text';

/** Blocks the parser leaves unnamed: raw HTML between block delimiters. */
export const FREEFORM = '#html';

export interface BlockNode {
	id: string;
	name: string;
	attrs: Record< string, unknown >;
	/** Wrapper markup with inner blocks removed, whitespace-normalized. */
	html: string;
	rawHtml: string;
	children: BlockNode[];
	parent: BlockNode | null;
	index: number;
	depth: number;
	/** metadata.name or className, whichever the pattern author supplied. */
	label: string | null;
	/** The block's real start/end lies outside the pasted hunk. */
	truncatedStart: boolean;
	truncatedEnd: boolean;
	/** Digest of this node and its whole subtree. */
	hash: string;
}

export interface ParsedDocument {
	roots: BlockNode[];
	/** Pre-order, so parents always precede their children. */
	nodes: BlockNode[];
	unopened: string[];
	unclosed: string[];
}

export function parseDocument( source: string, side: string ): ParsedDocument {
	const balanced = balance( source );
	const roots: BlockNode[] = [];
	const nodes: BlockNode[] = [];

	const build = (
		raw: ReturnType< typeof parse >,
		parent: BlockNode | null,
		path: string
	): BlockNode[] => {
		const built: BlockNode[] = [];
		for ( const block of raw ) {
			const rawHtml = block.innerHTML ?? '';
			const html = normalizeWhitespace( rawHtml );
			// Inter-block newlines parse as empty freeform blocks; they carry
			// no meaning and would otherwise dominate the diff.
			if ( block.blockName === null && html === '' ) {
				continue;
			}
			const attrs = ( block.attrs ?? {} ) as Record< string, unknown >;
			const index = built.length;
			const id = `${ path }/${ index }`;
			const node: BlockNode = {
				id,
				name: block.blockName ?? FREEFORM,
				attrs,
				html,
				rawHtml,
				children: [],
				parent,
				index,
				depth: parent ? parent.depth + 1 : 0,
				label: labelFor( attrs ),
				truncatedStart: false,
				truncatedEnd: false,
				hash: '',
			};
			nodes.push( node );
			node.children = build( block.innerBlocks, node, id );
			node.hash = hash(
				stableStringify( { name: node.name, attrs, html } ) +
					node.children.map( ( child ) => child.hash ).join( ',' )
			);
			built.push( node );
		}
		return built;
	};

	roots.push( ...build( parse( balanced.text ), null, side ) );
	markTruncated( roots, balanced.unopened.length, balanced.unclosed.length );

	return { roots, nodes, unopened: balanced.unopened, unclosed: balanced.unclosed };
}

/**
 * The blocks we had to invent delimiters for are the outermost nodes on the
 * left and right spines of the resulting tree.
 */
function markTruncated( roots: BlockNode[], startDepth: number, endDepth: number ): void {
	let node: BlockNode | undefined = roots[ 0 ];
	for ( let i = 0; i < startDepth && node; i++ ) {
		node.truncatedStart = true;
		node = node.children[ 0 ];
	}
	node = roots[ roots.length - 1 ];
	for ( let i = 0; i < endDepth && node; i++ ) {
		node.truncatedEnd = true;
		node = node.children[ node.children.length - 1 ];
	}
}

function labelFor( attrs: Record< string, unknown > ): string | null {
	const metadata = attrs.metadata;
	if ( metadata && typeof metadata === 'object' ) {
		const name = ( metadata as Record< string, unknown > ).name;
		if ( typeof name === 'string' && name ) {
			return name;
		}
	}
	return typeof attrs.className === 'string' && attrs.className ? attrs.className : null;
}

/** `core/group` reads as `group` in markup; show it the way it is written. */
export function displayName( node: BlockNode ): string {
	if ( node.name === FREEFORM ) {
		return 'html';
	}
	return node.name.startsWith( 'core/' ) ? node.name.slice( 5 ) : node.name;
}
