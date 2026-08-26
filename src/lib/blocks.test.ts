import { describe, expect, it } from 'vitest';
import { displayName, parseDocument } from './blocks';

describe( 'parseDocument', () => {
	it( 'keeps nesting in a hunk that never closes its blocks', () => {
		// Unbalanced, the WordPress parser emits the heading as a sibling of
		// the group rather than a child; the balancing pass is what prevents that.
		const doc = parseDocument(
			'<!-- wp:group {"align":"wide"} -->\n<div class="wp-block-group alignwide"><!-- wp:heading -->',
			'a'
		);
		expect( doc.roots ).toHaveLength( 1 );
		expect( doc.roots[ 0 ].name ).toBe( 'core/group' );
		expect( doc.roots[ 0 ].children.map( ( n ) => n.name ) ).toEqual( [ 'core/heading' ] );
		expect( doc.roots[ 0 ].truncatedEnd ).toBe( true );
	} );

	it( 'drops whitespace-only freeform nodes', () => {
		const doc = parseDocument(
			'<!-- wp:heading -->\n<h2>a</h2>\n<!-- /wp:heading -->\n\n<!-- wp:heading -->\n<h2>b</h2>\n<!-- /wp:heading -->',
			'a'
		);
		expect( doc.roots.map( ( n ) => n.name ) ).toEqual( [ 'core/heading', 'core/heading' ] );
	} );

	it( 'hashes identical subtrees alike and whitespace-shifted ones too', () => {
		const a = parseDocument( '<!-- wp:group -->\n<div>x</div>\n<!-- /wp:group -->', 'a' );
		const b = parseDocument( '<!-- wp:group -->\n   <div>x</div>\n\n<!-- /wp:group -->', 'b' );
		expect( a.roots[ 0 ].hash ).toBe( b.roots[ 0 ].hash );
	} );

	it( 'labels blocks by metadata name', () => {
		const doc = parseDocument( '<!-- wp:group {"metadata":{"name":"Hero"}} /-->', 'a' );
		expect( doc.roots[ 0 ].label ).toBe( 'Hero' );
		expect( displayName( doc.roots[ 0 ] ) ).toBe( 'group' );
	} );
} );
