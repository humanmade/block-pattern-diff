/**
 * Reconstructs the two sides of a pasted unified diff. Only the +/- prefixes
 * are interpreted; everything else is treated as context belonging to both
 * sides, which keeps pastes that lost their leading context spaces usable.
 */

const HEADER =
	/^(diff --git |index [0-9a-f]{7,}|--- |\+\+\+ |@@ |new file mode |deleted file mode |old mode |new mode |similarity index |rename (from|to) |Binary files |\\ No newline)/;

export interface DiffInput {
	before: string;
	after: string;
	/** False when the paste held no +/- lines, i.e. it is not a diff at all. */
	looksLikeDiff: boolean;
}

export function splitUnifiedDiff( source: string ): DiffInput {
	const before: string[] = [];
	const after: string[] = [];
	let sawChange = false;

	for ( const line of source.replace( /\r\n?/g, '\n' ).split( '\n' ) ) {
		if ( HEADER.test( line ) ) {
			continue;
		}
		if ( line.startsWith( '-' ) ) {
			before.push( line.slice( 1 ) );
			sawChange = true;
		} else if ( line.startsWith( '+' ) ) {
			after.push( line.slice( 1 ) );
			sawChange = true;
		} else {
			const context = line.startsWith( ' ' ) ? line.slice( 1 ) : line;
			before.push( context );
			after.push( context );
		}
	}

	return {
		before: before.join( '\n' ),
		after: after.join( '\n' ),
		looksLikeDiff: sawChange,
	};
}
