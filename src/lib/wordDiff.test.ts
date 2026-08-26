import { describe, expect, it } from 'vitest';
import { wordDiff } from './wordDiff';

describe( 'wordDiff', () => {
	it( 'isolates the class that was dropped', () => {
		const ops = wordDiff(
			'<div class="wp-block-group alignwide has-white-color">',
			'<div class="wp-block-group has-white-color">'
		);
		expect( ops.filter( ( op ) => op.kind === 'remove' ).map( ( op ) => op.text.trim() ) ).toEqual(
			[ 'alignwide' ]
		);
		expect( ops.some( ( op ) => op.kind === 'add' ) ).toBe( false );
	} );

	it( 'returns a single run when nothing changed', () => {
		expect( wordDiff( '<p>x</p>', '<p>x</p>' ) ).toEqual( [ { kind: 'same', text: '<p>x</p>' } ] );
	} );

	it( 'handles an empty side', () => {
		expect( wordDiff( '', 'a b' ) ).toEqual( [ { kind: 'add', text: 'a b' } ] );
	} );
} );
