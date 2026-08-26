import { describe, expect, it } from 'vitest';
import { splitUnifiedDiff } from './diffInput';

describe( 'splitUnifiedDiff', () => {
	it( 'routes +/- lines to one side and context to both', () => {
		const { files, looksLikeDiff } = splitUnifiedDiff(
			[ ' <p>keep</p>', '-<p>old</p>', '+<p>new</p>', ' <p>tail</p>' ].join( '\n' )
		);
		expect( files ).toHaveLength( 1 );
		expect( files[ 0 ].before ).toEqual( [ '<p>keep</p>\n<p>old</p>\n<p>tail</p>' ] );
		expect( files[ 0 ].after ).toEqual( [ '<p>keep</p>\n<p>new</p>\n<p>tail</p>' ] );
		expect( files[ 0 ].path ).toBe( null );
		expect( looksLikeDiff ).toBe( true );
	} );

	it( 'drops git and hunk headers', () => {
		const { files } = splitUnifiedDiff(
			[
				'diff --git a/p.php b/p.php',
				'index 1234567..89abcde 100644',
				'--- a/p.php',
				'+++ b/p.php',
				'@@ -1,3 +1,3 @@',
				'+<p>new</p>',
				'\\ No newline at end of file',
			].join( '\n' )
		);
		expect( files[ 0 ].before ).toEqual( [ '' ] );
		expect( files[ 0 ].after ).toEqual( [ '<p>new</p>' ] );
		expect( files[ 0 ].path ).toBe( 'p.php' );
	} );

	it( 'treats unprefixed pastes as context on both sides', () => {
		const { files, looksLikeDiff } = splitUnifiedDiff( '<p>a</p>\n<p>b</p>' );
		expect( files[ 0 ].before ).toEqual( files[ 0 ].after );
		expect( looksLikeDiff ).toBe( false );
	} );

	it( 'keeps each file separate', () => {
		// Concatenating these would let the matcher pair the two groups and
		// report the whole change as unchanged.
		const { files } = splitUnifiedDiff(
			[
				'diff --git a/patterns/a.php b/patterns/a.php',
				'--- a/patterns/a.php',
				'+++ b/patterns/a.php',
				'@@ -1,2 +1,1 @@',
				'-<!-- wp:group /-->',
				' <!-- wp:spacer /-->',
				'diff --git a/patterns/b.php b/patterns/b.php',
				'--- a/patterns/b.php',
				'+++ b/patterns/b.php',
				'@@ -1,1 +1,2 @@',
				' <!-- wp:separator /-->',
				'+<!-- wp:group /-->',
			].join( '\n' )
		);
		expect( files.map( ( file ) => file.path ) ).toEqual( [
			'patterns/a.php',
			'patterns/b.php',
		] );
		expect( files[ 0 ].before.join() ).toContain( 'wp:group' );
		expect( files[ 0 ].after.join() ).not.toContain( 'wp:group' );
		expect( files[ 1 ].after.join() ).toContain( 'wp:group' );
	} );

	it( 'splits plain diff -u output that has no git headers', () => {
		const { files } = splitUnifiedDiff(
			[
				'--- old/one.html\t2026-08-26 10:00:00',
				'+++ new/one.html\t2026-08-26 10:01:00',
				'@@ -1 +1 @@',
				'-<p>a</p>',
				'+<p>A</p>',
				'--- old/two.html\t2026-08-26 10:00:00',
				'+++ new/two.html\t2026-08-26 10:01:00',
				'@@ -1 +1 @@',
				'-<p>b</p>',
				'+<p>B</p>',
			].join( '\n' )
		);
		expect( files.map( ( file ) => file.path ) ).toEqual( [ 'new/one.html', 'new/two.html' ] );
		expect( files[ 1 ].after ).toEqual( [ '<p>B</p>' ] );
	} );

	it( 'names a deleted file by its old path', () => {
		const { files } = splitUnifiedDiff(
			[
				'diff --git a/gone.php b/gone.php',
				'deleted file mode 100644',
				'--- a/gone.php',
				'+++ /dev/null',
				'@@ -1 +0,0 @@',
				'-<p>bye</p>',
			].join( '\n' )
		);
		expect( files[ 0 ].path ).toBe( 'gone.php' );
		expect( files[ 0 ].after ).toEqual( [ '' ] );
	} );

	it( 'keeps each hunk as its own segment', () => {
		const { files } = splitUnifiedDiff(
			[
				'--- a/p.php',
				'+++ b/p.php',
				'@@ -1,2 +1,2 @@',
				'-<p>a</p>',
				'+<p>A</p>',
				'@@ -40,2 +40,2 @@',
				'-<p>z</p>',
				'+<p>Z</p>',
			].join( '\n' )
		);
		expect( files ).toHaveLength( 1 );
		expect( files[ 0 ].before ).toEqual( [ '<p>a</p>', '<p>z</p>' ] );
		expect( files[ 0 ].after ).toEqual( [ '<p>A</p>', '<p>Z</p>' ] );
	} );

	it( 'ignores file entries that carry no content', () => {
		const { files } = splitUnifiedDiff(
			[
				'diff --git a/renamed.php b/moved.php',
				'similarity index 100%',
				'rename from renamed.php',
				'rename to moved.php',
			].join( '\n' )
		);
		expect( files ).toEqual( [] );
	} );
} );
