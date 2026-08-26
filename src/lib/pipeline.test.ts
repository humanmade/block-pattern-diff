import { describe, expect, it } from 'vitest';
import { parseDocument } from './blocks';
import { splitUnifiedDiff } from './diffInput';
import { diffTrees } from './treeDiff';

const MOVED_BETWEEN_FILES = [
	'diff --git a/patterns/a.php b/patterns/a.php',
	'--- a/patterns/a.php',
	'+++ b/patterns/a.php',
	'@@ -1,4 +1,1 @@',
	'-<!-- wp:group {"metadata":{"name":"Promo"}} -->',
	'-<div class="wp-block-group"><!-- wp:paragraph --><p>Buy</p><!-- /wp:paragraph --></div>',
	'-<!-- /wp:group -->',
	' <!-- wp:spacer /-->',
	'diff --git a/patterns/b.php b/patterns/b.php',
	'--- a/patterns/b.php',
	'+++ b/patterns/b.php',
	'@@ -1,1 +1,4 @@',
	' <!-- wp:separator /-->',
	'+<!-- wp:group {"metadata":{"name":"Promo"}} -->',
	'+<div class="wp-block-group"><!-- wp:paragraph --><p>Buy</p><!-- /wp:paragraph --></div>',
	'+<!-- /wp:group -->',
].join( '\n' );

function statuses( before: string[], after: string[] ) {
	const diff = diffTrees( parseDocument( before, 'a' ), parseDocument( after, 'b' ) );
	return diff.diffs.map( ( entry ) => {
		const node = ( entry.after ?? entry.before )!;
		return `${ entry.status } ${ node.name }`;
	} );
}

const TWO_HUNKS = [
	'--- a/patterns/hero.php',
	'+++ b/patterns/hero.php',
	'@@ -3,3 +3,4 @@',
	'-<!-- wp:group {"align":"wide"} -->',
	'-<div class="wp-block-group alignwide"><!-- wp:heading -->',
	'+<!-- wp:group {"align":"full"} -->',
	'+<div class="wp-block-group alignfull"><!-- wp:group -->',
	'+<div class="wp-block-group"><!-- wp:heading -->',
	' <h2>Welcome</h2>',
	' <!-- /wp:heading --></div>',
	' <!-- /wp:group -->',
	'@@ -40,2 +41,2 @@',
	'-<!-- wp:paragraph {"fontSize":"small"} --><p>Tag</p><!-- /wp:paragraph -->',
	'+<!-- wp:paragraph {"fontSize":"medium"} --><p>Tag</p><!-- /wp:paragraph -->',
].join( '\n' );

describe( 'diffing a file with several hunks', () => {
	it( 'does not let an unclosed block in one hunk adopt the next hunk', () => {
		// Joining the hunks first pulled the second hunk's paragraph inside the
		// first hunk's group, so it reported as a removal plus an addition at
		// different depths instead of one changed block.
		const [ file ] = splitUnifiedDiff( TWO_HUNKS ).files;
		expect( file.before ).toHaveLength( 2 );

		const before = parseDocument( file.before, 'a' );
		const after = parseDocument( file.after, 'b' );

		const paragraphs = ( doc: typeof before ) =>
			doc.roots.filter( ( node ) => node.name === 'core/paragraph' );
		expect( paragraphs( before ) ).toHaveLength( 1 );
		expect( paragraphs( after ) ).toHaveLength( 1 );

		const diff = diffTrees( before, after );
		const paragraph = diff.diffs.find(
			( entry ) => ( entry.after ?? entry.before )!.name === 'core/paragraph'
		);
		expect( paragraph?.status ).toBe( 'changed' );
		expect( paragraph?.attrs.find( ( a ) => a.path === 'fontSize' ) ).toMatchObject( {
			before: 'small',
			after: 'medium',
		} );
	} );
} );

describe( 'diffing a multi-file paste', () => {
	it( 'reports a block deleted in one file and added in another as both', () => {
		// Diffing the concatenation instead would let the matcher pair the two
		// identical groups, cancelling the deletion against the addition and
		// reporting the whole change as unchanged.
		const { files } = splitUnifiedDiff( MOVED_BETWEEN_FILES );
		expect( files ).toHaveLength( 2 );

		expect( statuses( files[ 0 ].before, files[ 0 ].after ) ).toEqual( [
			'removed core/group',
			'removed core/paragraph',
			'unchanged core/spacer',
		] );
		expect( statuses( files[ 1 ].before, files[ 1 ].after ) ).toEqual( [
			'unchanged core/separator',
			'added core/group',
			'added core/paragraph',
		] );
	} );

	it( 'still finds the change if the same paste is diffed as one document', () => {
		// Guards the claim above: this is what the concatenated behaviour was.
		const joined = splitUnifiedDiff( MOVED_BETWEEN_FILES ).files;
		const before = [ joined.flatMap( ( file ) => file.before ).join( '\n' ) ];
		const after = [ joined.flatMap( ( file ) => file.after ).join( '\n' ) ];
		expect( statuses( before, after ).every( ( s ) => s.startsWith( 'unchanged' ) ) ).toBe( true );
	} );
} );
