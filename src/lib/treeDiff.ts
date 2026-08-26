import type { BlockNode, ParsedDocument } from './blocks';
import { attrSimilarity, compareAttrs, flattenAttrs, type AttrRow } from './attrDiff';
import { deepEqual, similarity } from './text';

export type NodeStatus = 'unchanged' | 'changed' | 'added' | 'removed';
/** `reparent`: the block landed under a different parent. `reorder`: same parent, new position. */
export type MoveKind = 'reparent' | 'reorder' | null;

export interface NodeDiff {
	before: BlockNode | null;
	after: BlockNode | null;
	status: NodeStatus;
	move: MoveKind;
	attrs: AttrRow[];
	htmlChanged: boolean;
}

export interface AttrMove {
	path: string;
	from: BlockNode;
	to: BlockNode;
	/** `moved`: identical value on a different block. `retargeted`: same property, new value and new block. */
	kind: 'moved' | 'retargeted';
	before: unknown;
	after: unknown;
}

export interface TreeDiff {
	/** before node -> after node. */
	pairs: Map< BlockNode, BlockNode >;
	/** after node -> before node. */
	partners: Map< BlockNode, BlockNode >;
	/** Keyed by both sides of a pair, so either node resolves to its diff. */
	byNode: Map< BlockNode, NodeDiff >;
	/** One entry per logical block; a pair appears once, unlike in `byNode`. */
	diffs: NodeDiff[];
	attrMoves: AttrMove[];
	/** Keyed `${ node.id }|${ path }` for both endpoints of each move. */
	attrMoveIndex: Map< string, AttrMove >;
}

const MATCH_THRESHOLD = 0.5;

export function diffTrees( before: ParsedDocument, after: ParsedDocument ): TreeDiff {
	const pairs = new Map< BlockNode, BlockNode >();
	const partners = new Map< BlockNode, BlockNode >();

	const pair = ( b: BlockNode, a: BlockNode ): void => {
		pairs.set( b, a );
		partners.set( a, b );
	};

	matchIdenticalSubtrees( before.nodes, after.nodes, pair, pairs, partners );
	// Post-order first so settled children inform their parents, then
	// pre-order so settled parents inform their remaining children.
	matchBySimilarity( postOrder( before.roots ), after.nodes, pair, pairs, partners );
	matchBySimilarity( before.nodes, after.nodes, pair, pairs, partners );

	const byNode = new Map< BlockNode, NodeDiff >();
	const diffs: NodeDiff[] = [];

	for ( const node of before.nodes ) {
		const counterpart = pairs.get( node );
		if ( ! counterpart ) {
			const diff: NodeDiff = {
				before: node,
				after: null,
				status: 'removed',
				move: null,
				attrs: compareAttrs( node.attrs, {} ),
				htmlChanged: false,
			};
			byNode.set( node, diff );
			diffs.push( diff );
			continue;
		}
		const attrs = compareAttrs( node.attrs, counterpart.attrs );
		const htmlChanged = node.html !== counterpart.html;
		const diff: NodeDiff = {
			before: node,
			after: counterpart,
			status:
				htmlChanged || attrs.some( ( row ) => row.status !== 'unchanged' )
					? 'changed'
					: 'unchanged',
			move: moveKind( node, counterpart, pairs ),
			attrs,
			htmlChanged,
		};
		byNode.set( node, diff );
		byNode.set( counterpart, diff );
		diffs.push( diff );
	}

	for ( const node of after.nodes ) {
		if ( partners.has( node ) ) {
			continue;
		}
		const diff: NodeDiff = {
			before: null,
			after: node,
			status: 'added',
			move: null,
			attrs: compareAttrs( {}, node.attrs ),
			htmlChanged: false,
		};
		byNode.set( node, diff );
		diffs.push( diff );
	}

	const attrMoves = findAttrMoves( before, after, pairs, byNode );
	const attrMoveIndex = new Map< string, AttrMove >();
	for ( const move of attrMoves ) {
		attrMoveIndex.set( `${ move.from.id }|${ move.path }`, move );
		attrMoveIndex.set( `${ move.to.id }|${ move.path }`, move );
	}

	return { pairs, partners, byNode, diffs, attrMoves, attrMoveIndex };
}

/**
 * Anchor pass: subtrees that hashed identically are the same content, so pair
 * the largest ones first and adopt their descendants wholesale.
 */
function matchIdenticalSubtrees(
	beforeNodes: BlockNode[],
	afterNodes: BlockNode[],
	pair: ( b: BlockNode, a: BlockNode ) => void,
	pairs: Map< BlockNode, BlockNode >,
	partners: Map< BlockNode, BlockNode >
): void {
	const buckets = new Map< string, BlockNode[] >();
	for ( const node of afterNodes ) {
		const bucket = buckets.get( node.hash );
		if ( bucket ) {
			bucket.push( node );
		} else {
			buckets.set( node.hash, [ node ] );
		}
	}

	const bySizeDesc = beforeNodes
		.slice()
		.sort( ( a, b ) => subtreeSize( b ) - subtreeSize( a ) );

	for ( const node of bySizeDesc ) {
		if ( pairs.has( node ) ) {
			continue;
		}
		const candidates = ( buckets.get( node.hash ) ?? [] ).filter(
			( candidate ) => ! partners.has( candidate )
		);
		if ( ! candidates.length ) {
			continue;
		}
		// Prefer the candidate sitting at the same depth and position; that is
		// the one that did not move.
		candidates.sort(
			( a, b ) =>
				Math.abs( a.depth - node.depth ) - Math.abs( b.depth - node.depth ) ||
				Math.abs( a.index - node.index ) - Math.abs( b.index - node.index )
		);
		pairSubtree( node, candidates[ 0 ], pair );
	}
}

/** Identical hashes mean identical shape, so descendants line up by position. */
function pairSubtree(
	b: BlockNode,
	a: BlockNode,
	pair: ( b: BlockNode, a: BlockNode ) => void
): void {
	pair( b, a );
	for ( let i = 0; i < b.children.length && i < a.children.length; i++ ) {
		pairSubtree( b.children[ i ], a.children[ i ], pair );
	}
}

function matchBySimilarity(
	beforeNodes: BlockNode[],
	afterNodes: BlockNode[],
	pair: ( b: BlockNode, a: BlockNode ) => void,
	pairs: Map< BlockNode, BlockNode >,
	partners: Map< BlockNode, BlockNode >
): void {
	for ( const node of beforeNodes ) {
		if ( pairs.has( node ) ) {
			continue;
		}
		let best: BlockNode | null = null;
		let bestScore = MATCH_THRESHOLD;
		for ( const candidate of afterNodes ) {
			if ( candidate.name !== node.name || partners.has( candidate ) ) {
				continue;
			}
			const score = score2( node, candidate, pairs );
			if ( score > bestScore ) {
				best = candidate;
				bestScore = score;
			}
		}
		if ( best ) {
			pair( node, best );
		}
	}
}

/**
 * Weighted over whichever facets both blocks actually have, so an attribute
 * change cannot sink a block whose children and markup are untouched.
 */
function score2( b: BlockNode, a: BlockNode, pairs: Map< BlockNode, BlockNode > ): number {
	let total = 0;
	let weight = 0;

	if ( flattenAttrs( b.attrs ).size || flattenAttrs( a.attrs ).size ) {
		total += 0.35 * attrSimilarity( b.attrs, a.attrs );
		weight += 0.35;
	}
	if ( b.html || a.html ) {
		total += 0.25 * similarity( b.html, a.html );
		weight += 0.25;
	}
	if ( b.children.length || a.children.length ) {
		let shared = 0;
		for ( const child of b.children ) {
			const counterpart = pairs.get( child );
			if ( counterpart && counterpart.parent === a ) {
				shared++;
			}
		}
		total += 0.4 * ( ( 2 * shared ) / ( b.children.length + a.children.length ) );
		weight += 0.4;
	}
	if ( ! weight ) {
		return 0;
	}

	const base = total / weight;
	const parentAgrees =
		( b.parent ? pairs.get( b.parent ) ?? null : null ) === ( a.parent ?? null );
	return Math.min( 1, base + ( parentAgrees ? 0.1 : 0 ) );
}

function moveKind(
	b: BlockNode,
	a: BlockNode,
	pairs: Map< BlockNode, BlockNode >
): MoveKind {
	const expectedParent = b.parent ? pairs.get( b.parent ) ?? null : null;
	if ( expectedParent !== ( a.parent ?? null ) ) {
		return 'reparent';
	}
	return rankAmongMatched( b, pairs, false ) === rankAmongMatched( a, pairs, true )
		? null
		: 'reorder';
}

/** Position among siblings that exist on both sides; unmatched siblings would otherwise shift everything. */
function rankAmongMatched(
	node: BlockNode,
	pairs: Map< BlockNode, BlockNode >,
	isAfterSide: boolean
): number {
	const siblings = node.parent ? node.parent.children : [ node ];
	let rank = 0;
	for ( const sibling of siblings ) {
		if ( sibling === node ) {
			return rank;
		}
		const matched = isAfterSide
			? [ ...pairs.values() ].includes( sibling )
			: pairs.has( sibling );
		if ( matched ) {
			rank++;
		}
	}
	return rank;
}

/**
 * An attribute that vanishes from one block and appears at the same path on a
 * related block is the "properties migrated into a new wrapper" case. The
 * ancestor/descendant constraint is what keeps this from firing on unrelated
 * blocks that happen to share a property name.
 */
function findAttrMoves(
	before: ParsedDocument,
	after: ParsedDocument,
	pairs: Map< BlockNode, BlockNode >,
	byNode: Map< BlockNode, NodeDiff >
): AttrMove[] {
	interface Endpoint {
		node: BlockNode;
		anchor: BlockNode | null;
		path: string;
		value: unknown;
	}

	const removals: Endpoint[] = [];
	const additions: Endpoint[] = [];

	for ( const node of before.nodes ) {
		const diff = byNode.get( node );
		if ( ! diff ) {
			continue;
		}
		const anchor = afterAnchor( node, pairs );
		for ( const row of diff.attrs ) {
			if ( row.status === 'removed' ) {
				removals.push( { node, anchor, path: row.path, value: row.before } );
			}
		}
	}
	for ( const node of after.nodes ) {
		const diff = byNode.get( node );
		if ( ! diff || diff.after !== node ) {
			continue;
		}
		for ( const row of diff.attrs ) {
			if ( row.status === 'added' ) {
				additions.push( { node, anchor: node, path: row.path, value: row.after } );
			}
		}
	}

	const moves: AttrMove[] = [];
	const claimed = new Set< Endpoint >();

	for ( const removal of removals ) {
		if ( ! removal.anchor ) {
			continue;
		}
		const candidates = additions.filter(
			( addition ) =>
				! claimed.has( addition ) &&
				addition.path === removal.path &&
				addition.node !== removal.anchor &&
				related( removal.anchor as BlockNode, addition.node )
		);
		if ( ! candidates.length ) {
			continue;
		}
		// An identical value is strong evidence of a move; a changed value is
		// only a plausible one, so prefer the former.
		candidates.sort(
			( a, b ) =>
				Number( deepEqual( b.value, removal.value ) ) -
					Number( deepEqual( a.value, removal.value ) ) ||
				Math.abs( a.node.depth - ( removal.anchor as BlockNode ).depth ) -
					Math.abs( b.node.depth - ( removal.anchor as BlockNode ).depth )
		);
		const chosen = candidates[ 0 ];
		claimed.add( chosen );
		moves.push( {
			path: removal.path,
			from: removal.node,
			to: chosen.node,
			kind: deepEqual( chosen.value, removal.value ) ? 'moved' : 'retargeted',
			before: removal.value,
			after: chosen.value,
		} );
	}

	return moves;
}

/** Where a before-side node sits in the after tree, falling back to its nearest surviving ancestor. */
function afterAnchor( node: BlockNode, pairs: Map< BlockNode, BlockNode > ): BlockNode | null {
	let current: BlockNode | null = node;
	while ( current ) {
		const counterpart = pairs.get( current );
		if ( counterpart ) {
			return counterpart;
		}
		current = current.parent;
	}
	return null;
}

function related( a: BlockNode, b: BlockNode ): boolean {
	return isAncestor( a, b ) || isAncestor( b, a );
}

function isAncestor( ancestor: BlockNode, node: BlockNode ): boolean {
	let current = node.parent;
	while ( current ) {
		if ( current === ancestor ) {
			return true;
		}
		current = current.parent;
	}
	return false;
}

function subtreeSize( node: BlockNode ): number {
	return 1 + node.children.reduce( ( sum, child ) => sum + subtreeSize( child ), 0 );
}

function postOrder( roots: BlockNode[] ): BlockNode[] {
	const out: BlockNode[] = [];
	const visit = ( node: BlockNode ): void => {
		node.children.forEach( visit );
		out.push( node );
	};
	roots.forEach( visit );
	return out;
}
