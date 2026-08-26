/**
 * Token-level diff for a single line of markup. Splitting on whitespace makes
 * each class name and attribute its own token, so a change reads as
 * "alignwide removed" rather than as two near-identical walls of text.
 */

export type WordOp = { kind: 'same' | 'add' | 'remove'; text: string };

export function wordDiff( before: string, after: string ): WordOp[] {
	const a = tokenize( before );
	const b = tokenize( after );

	// Longest common subsequence table.
	const rows = a.length + 1;
	const cols = b.length + 1;
	const lcs = new Uint32Array( rows * cols );
	for ( let i = a.length - 1; i >= 0; i-- ) {
		for ( let j = b.length - 1; j >= 0; j-- ) {
			lcs[ i * cols + j ] =
				a[ i ] === b[ j ]
					? lcs[ ( i + 1 ) * cols + j + 1 ] + 1
					: Math.max( lcs[ ( i + 1 ) * cols + j ], lcs[ i * cols + j + 1 ] );
		}
	}

	const ops: WordOp[] = [];
	const push = ( kind: WordOp[ 'kind' ], text: string ): void => {
		const last = ops[ ops.length - 1 ];
		if ( last && last.kind === kind ) {
			last.text += text;
		} else {
			ops.push( { kind, text } );
		}
	};

	let i = 0;
	let j = 0;
	while ( i < a.length && j < b.length ) {
		if ( a[ i ] === b[ j ] ) {
			push( 'same', a[ i++ ] );
			j++;
		} else if ( lcs[ ( i + 1 ) * cols + j ] >= lcs[ i * cols + j + 1 ] ) {
			push( 'remove', a[ i++ ] );
		} else {
			push( 'add', b[ j++ ] );
		}
	}
	while ( i < a.length ) {
		push( 'remove', a[ i++ ] );
	}
	while ( j < b.length ) {
		push( 'add', b[ j++ ] );
	}
	return ops;
}

function tokenize( value: string ): string[] {
	return value.split( /(\s+)/ ).filter( ( token ) => token !== '' );
}
