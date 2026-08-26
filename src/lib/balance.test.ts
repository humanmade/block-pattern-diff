import { describe, expect, it } from 'vitest';
import { balance } from './balance';

describe( 'balance', () => {
	it( 'closes blocks the hunk leaves open', () => {
		const result = balance( '<!-- wp:group -->\n<div><!-- wp:heading -->' );
		expect( result.unclosed ).toEqual( [ 'core/group', 'core/heading' ] );
		expect( result.text.trimEnd().endsWith( '<!-- /wp:heading -->\n<!-- /wp:group -->' ) ).toBe(
			true
		);
	} );

	it( 'opens blocks the hunk only closes, outermost first', () => {
		const result = balance(
			'<p>x</p>\n<!-- /wp:paragraph --></div>\n<!-- /wp:column -->\n<!-- /wp:columns -->'
		);
		expect( result.unopened ).toEqual( [ 'core/columns', 'core/column', 'core/paragraph' ] );
		expect( result.text.startsWith( '<!-- wp:columns -->\n<!-- wp:column -->\n<!-- wp:paragraph -->' ) ).toBe(
			true
		);
	} );

	it( 'ignores self-closing blocks', () => {
		expect( balance( '<!-- wp:spacer /-->' ).unclosed ).toEqual( [] );
	} );

	it( 'keeps balanced markup untouched', () => {
		const source = '<!-- wp:group -->\n<div></div>\n<!-- /wp:group -->';
		const result = balance( source );
		expect( result.text ).toBe( source );
		expect( result.unopened ).toEqual( [] );
		expect( result.unclosed ).toEqual( [] );
	} );
} );
