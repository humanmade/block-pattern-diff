import { describe, expect, it } from 'vitest';
import { parseDocument } from './blocks';
import { splitUnifiedDiff } from './diffInput';
import { EXAMPLE_DIFF } from './example';
import { diffTrees } from './treeDiff';

function run( source: string ) {
	const input = splitUnifiedDiff( source );
	const before = parseDocument( input.before, 'a' );
	const after = parseDocument( input.after, 'b' );
	return { before, after, diff: diffTrees( before, after ) };
}

describe( 'diffTrees', () => {
	it( 'sees a block wrapped in a new group as a re-parent, not a rewrite', () => {
		const { before, after, diff } = run( EXAMPLE_DIFF );

		const originalGroup = before.roots[ 0 ];
		expect( originalGroup.label ).toBe( 'Featured stories in Africa' );

		const outerGroup = after.roots[ 0 ];
		expect( outerGroup.label ).toBe( 'Featured stories well' );
		expect( diff.byNode.get( outerGroup )?.status ).toBe( 'added' );

		// The original group survives, now nested inside the new wrapper.
		const counterpart = diff.pairs.get( originalGroup );
		expect( counterpart?.label ).toBe( 'Featured stories in Africa' );
		expect( counterpart?.parent ).toBe( outerGroup );

		const groupDiff = diff.byNode.get( originalGroup );
		expect( groupDiff?.move ).toBe( 'reparent' );
		expect( groupDiff?.status ).toBe( 'changed' );
		expect(
			groupDiff?.attrs.filter( ( row ) => row.status !== 'unchanged' ).map( ( r ) => r.path )
		).toEqual( [ 'align' ] );

		// The heading is untouched and must not be dragged into the noise.
		const heading = originalGroup.children.find( ( n ) => n.name === 'core/heading' );
		expect( diff.byNode.get( heading! )?.status ).toBe( 'unchanged' );
	} );

	it( 'reports align as retargeted onto the new wrapper', () => {
		const { diff } = run( EXAMPLE_DIFF );
		const move = diff.attrMoves.find( ( m ) => m.path === 'align' );
		expect( move ).toBeDefined();
		expect( move?.kind ).toBe( 'retargeted' );
		expect( move?.before ).toBe( 'wide' );
		expect( move?.after ).toBe( 'full' );
		expect( move?.to.label ).toBe( 'Featured stories well' );
	} );

	it( 'treats wrapping a block as a re-parent, with nothing else changed', () => {
		const { diff } = run(
			[
				'-<!-- wp:group {"align":"wide"} -->',
				'-<div class="wp-block-group alignwide"><!-- wp:paragraph -->',
				'+<!-- wp:group -->',
				'+<div class="wp-block-group"><!-- wp:group {"align":"wide"} -->',
				'+<div class="wp-block-group alignwide"><!-- wp:paragraph -->',
				' <p>hello</p>',
				' <!-- /wp:paragraph --></div>',
				' <!-- /wp:group -->',
			].join( '\n' )
		);
		const reparented = diff.diffs.filter( ( d ) => d.move === 'reparent' );
		expect( reparented ).toHaveLength( 1 );
		expect( reparented[ 0 ].status ).toBe( 'unchanged' );
		// Nothing actually left a block, so no attribute move should be claimed.
		expect( diff.attrMoves ).toEqual( [] );
	} );

	it( 'detects an attribute carried verbatim onto a new wrapper', () => {
		const { diff } = run(
			[
				'-<!-- wp:group {"metadata":{"name":"Well"},"layout":{"type":"constrained","contentSize":"1270px"}} -->',
				'-<div class="wp-block-group">',
				'+<!-- wp:group {"layout":{"type":"constrained","contentSize":"1270px"}} -->',
				'+<div class="wp-block-group"><!-- wp:group {"metadata":{"name":"Well"}} -->',
				'+<div class="wp-block-group">',
				' <!-- wp:paragraph --><p>hello</p><!-- /wp:paragraph -->',
				' </div>',
				' <!-- /wp:group -->',
			].join( '\n' )
		);
		const move = diff.attrMoves.find( ( m ) => m.path === 'layout.contentSize' );
		expect( move?.kind ).toBe( 'moved' );
		expect( move?.after ).toBe( '1270px' );
		expect( move?.from.label ).toBe( 'Well' );
		expect( move?.to.label ).toBe( null );
	} );

	it( 'flags a reordered sibling without calling it added and removed', () => {
		const { diff } = run(
			[
				' <!-- wp:group -->',
				' <div class="wp-block-group">',
				'-<!-- wp:heading --><h2>A</h2><!-- /wp:heading -->',
				' <!-- wp:paragraph --><p>B</p><!-- /wp:paragraph -->',
				'+<!-- wp:heading --><h2>A</h2><!-- /wp:heading -->',
				' </div>',
				' <!-- /wp:group -->',
			].join( '\n' )
		);
		const moves = diff.diffs.filter( ( d ) => d.move === 'reorder' );
		expect( moves.length ).toBeGreaterThan( 0 );
		expect( diff.diffs.some( ( d ) => d.status === 'removed' ) ).toBe( false );
	} );

	it( 'reports an unchanged pattern as entirely unchanged', () => {
		const { diff } = run( '<!-- wp:group -->\n<div><!-- wp:heading --><h2>x</h2><!-- /wp:heading --></div>\n<!-- /wp:group -->' );
		expect( diff.diffs.every( ( d ) => d.status === 'unchanged' ) ).toBe( true );
	} );
} );
