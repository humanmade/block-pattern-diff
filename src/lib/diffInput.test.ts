import { describe, expect, it } from 'vitest';
import { splitUnifiedDiff } from './diffInput';

describe( 'splitUnifiedDiff', () => {
	it( 'routes +/- lines to one side and context to both', () => {
		const { before, after, looksLikeDiff } = splitUnifiedDiff(
			[ ' <p>keep</p>', '-<p>old</p>', '+<p>new</p>', ' <p>tail</p>' ].join( '\n' )
		);
		expect( before ).toBe( '<p>keep</p>\n<p>old</p>\n<p>tail</p>' );
		expect( after ).toBe( '<p>keep</p>\n<p>new</p>\n<p>tail</p>' );
		expect( looksLikeDiff ).toBe( true );
	} );

	it( 'drops git and hunk headers', () => {
		const { before, after } = splitUnifiedDiff(
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
		expect( before ).toBe( '' );
		expect( after ).toBe( '<p>new</p>' );
	} );

	it( 'treats unprefixed pastes as context on both sides', () => {
		const { before, after, looksLikeDiff } = splitUnifiedDiff( '<p>a</p>\n<p>b</p>' );
		expect( before ).toBe( after );
		expect( looksLikeDiff ).toBe( false );
	} );
} );
