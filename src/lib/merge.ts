import type { BlockNode, ParsedDocument } from './blocks';
import type { NodeDiff, TreeDiff } from './treeDiff';

/**
 * `moved-out` is the stub left at a block's old location; the block itself is
 * rendered once, at its new one.
 */
export type RowKind = 'pair' | 'added' | 'removed' | 'moved-out';

export interface MergedRow {
	kind: RowKind;
	diff: NodeDiff;
	children: MergedRow[];
	depth: number;
	key: string;
	/** Shared by a moved block's stub and its real row, for cross-highlighting. */
	pairKey: string | null;
}

/**
 * One tree holding both sides: after-tree order is authoritative, with removed
 * blocks and move stubs spliced back in at the positions they held before.
 */
export function mergeTrees(
	before: ParsedDocument,
	after: ParsedDocument,
	diff: TreeDiff
): MergedRow[] {
	const level = (
		beforeChildren: BlockNode[],
		afterChildren: BlockNode[],
		afterParent: BlockNode | null,
		depth: number
	): MergedRow[] => {
		const rows: MergedRow[] = [];
		const positions = new Map( afterChildren.map( ( node, i ) => [ node, i ] ) );
		let cursor = 0;

		const emitAfter = ( node: BlockNode ): void => {
			const nodeDiff = diff.byNode.get( node );
			if ( ! nodeDiff ) {
				return;
			}
			const counterpart = diff.partners.get( node ) ?? null;
			rows.push( {
				kind: counterpart ? 'pair' : 'added',
				diff: nodeDiff,
				depth,
				key: `${ node.id }:in`,
				pairKey: counterpart ? counterpart.id : null,
				children: level( counterpart?.children ?? [], node.children, node, depth + 1 ),
			} );
		};

		for ( const node of beforeChildren ) {
			const counterpart = diff.pairs.get( node );
			if ( counterpart && counterpart.parent === afterParent ) {
				const target = positions.get( counterpart );
				while ( target !== undefined && cursor <= target ) {
					emitAfter( afterChildren[ cursor++ ] );
				}
				continue;
			}
			const nodeDiff = diff.byNode.get( node );
			if ( ! nodeDiff ) {
				continue;
			}
			rows.push( {
				kind: counterpart ? 'moved-out' : 'removed',
				diff: nodeDiff,
				depth,
				key: `${ node.id }:out`,
				pairKey: counterpart ? node.id : null,
				// A moved block's subtree belongs to its new location; only the
				// stub stays behind.
				children: counterpart ? [] : level( node.children, [], null, depth + 1 ),
			} );
		}
		while ( cursor < afterChildren.length ) {
			emitAfter( afterChildren[ cursor++ ] );
		}
		return rows;
	};

	return level( before.roots, after.roots, null, 0 );
}

export function flattenRows( rows: MergedRow[], into: MergedRow[] = [] ): MergedRow[] {
	for ( const row of rows ) {
		into.push( row );
		flattenRows( row.children, into );
	}
	return into;
}

export interface DiffStats {
	added: number;
	removed: number;
	changed: number;
	moved: number;
	unchanged: number;
}

export function summarize( rows: MergedRow[] ): DiffStats {
	const stats: DiffStats = { added: 0, removed: 0, changed: 0, moved: 0, unchanged: 0 };
	for ( const row of flattenRows( rows ) ) {
		if ( row.kind === 'moved-out' ) {
			continue;
		}
		if ( row.diff.move ) {
			stats.moved++;
		}
		if ( row.diff.status === 'added' ) {
			stats.added++;
		} else if ( row.diff.status === 'removed' ) {
			stats.removed++;
		} else if ( row.diff.status === 'changed' ) {
			stats.changed++;
		} else if ( ! row.diff.move ) {
			stats.unchanged++;
		}
	}
	return stats;
}
