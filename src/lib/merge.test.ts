import { describe, expect, it } from 'vitest';
import { parseDocument } from './blocks';
import { splitUnifiedDiff } from './diffInput';
import { EXAMPLE_DIFF } from './example';
import { flattenRows, mergeTrees, summarize } from './merge';
import { diffTrees } from './treeDiff';

function merged( source: string ) {
	const [ file ] = splitUnifiedDiff( source ).files;
	const before = parseDocument( file.before, 'a' );
	const after = parseDocument( file.after, 'b' );
	return mergeTrees( before, after, diffTrees( before, after ) );
}

describe( 'mergeTrees', () => {
	it( 'leaves a stub where a block was and renders it once at its new home', () => {
		const rows = merged( EXAMPLE_DIFF );

		expect( rows.map( ( row ) => row.kind ) ).toEqual( [ 'moved-out', 'added' ] );
		const stub = rows[ 0 ];
		expect( stub.diff.before?.label ).toBe( 'Featured stories in region' );
		// The subtree belongs to the new location, so the stub carries none of it.
		expect( stub.children ).toEqual( [] );

		const wrapper = rows[ 1 ];
		expect( wrapper.diff.after?.label ).toBe( 'Featured stories wrap' );
		expect( wrapper.children.map( ( row ) => row.kind ) ).toEqual( [ 'pair' ] );

		const moved = wrapper.children[ 0 ];
		expect( moved.diff.move ).toBe( 'reparent' );
		expect( moved.pairKey ).toBe( stub.pairKey );
		expect( moved.children.map( ( row ) => row.diff.after?.name ) ).toEqual( [ 'core/heading' ] );
	} );

	it( 'counts each block once, ignoring move stubs', () => {
		const rows = merged( EXAMPLE_DIFF );
		expect( flattenRows( rows ) ).toHaveLength( 4 );
		expect( summarize( rows ) ).toEqual( {
			added: 1,
			removed: 0,
			changed: 1,
			moved: 1,
			unchanged: 1,
		} );
	} );
} );
