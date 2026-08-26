/**
 * Reconstructs the two sides of a pasted unified diff, one entry per file.
 *
 * Files must stay separate. Concatenating them lets the matcher pair blocks
 * across file boundaries, so a block deleted from one file and added to
 * another cancels out and reports as unchanged.
 *
 * Within a file, only the +/- prefixes are interpreted; everything else is
 * context belonging to both sides, which keeps pastes that lost their leading
 * context spaces usable.
 */

const FILE_START = /^diff --git /;
const OLD_PATH = /^--- (.+)$/;
const NEW_PATH = /^\+\+\+ (.+)$/;
const HUNK = /^@@ /;
const IGNORED =
	/^(index [0-9a-f]{7,}|new file mode |deleted file mode |old mode |new mode |similarity index |dissimilarity index |rename (from|to) |copy (from|to) |Binary files |GIT binary patch|\\ No newline)/;

export interface DiffFile {
	/** Display path, or null when the paste carried no file headers. */
	path: string | null;
	/**
	 * One entry per hunk. Hunks are kept apart because the file's elided
	 * content sits between them, so a block opened in one hunk is never
	 * really the parent of a block in the next.
	 */
	before: string[];
	after: string[];
}

export interface DiffInput {
	files: DiffFile[];
	/** False when the paste held no +/- lines, i.e. it is not a diff at all. */
	looksLikeDiff: boolean;
}

interface Draft {
	oldPath: string | null;
	newPath: string | null;
	headerPath: string | null;
	before: string[][];
	after: string[][];
	touched: boolean;
}

export function splitUnifiedDiff( source: string ): DiffInput {
	const drafts: Draft[] = [];
	let current: Draft | null = null;
	let sawChange = false;

	const start = ( headerPath: string | null = null ): Draft => {
		const draft: Draft = {
			oldPath: null,
			newPath: null,
			headerPath,
			before: [ [] ],
			after: [ [] ],
			touched: false,
		};
		drafts.push( draft );
		return draft;
	};

	for ( const line of source.replace( /\r\n?/g, '\n' ).split( '\n' ) ) {
		if ( FILE_START.test( line ) ) {
			current = start( pathFromHeader( line ) );
			continue;
		}
		if ( IGNORED.test( line ) ) {
			continue;
		}

		const oldPath = OLD_PATH.exec( line );
		if ( oldPath ) {
			// Plain `diff -u` output has no `diff --git` line, so a second
			// `---` is the only signal that a new file started.
			if ( ! current || current.touched ) {
				current = start();
			}
			current.oldPath = cleanPath( oldPath[ 1 ] );
			continue;
		}

		const newPath = NEW_PATH.exec( line );
		if ( newPath ) {
			current = current ?? start();
			current.newPath = cleanPath( newPath[ 1 ] );
			continue;
		}

		if ( HUNK.test( line ) ) {
			current = current ?? start();
			// Start a fresh segment, unless the current one is still empty.
			if ( last( current.before ).length || last( current.after ).length ) {
				current.before.push( [] );
				current.after.push( [] );
			}
			continue;
		}

		current = current ?? start();
		current.touched = true;
		if ( line.startsWith( '-' ) ) {
			last( current.before ).push( line.slice( 1 ) );
			sawChange = true;
		} else if ( line.startsWith( '+' ) ) {
			last( current.after ).push( line.slice( 1 ) );
			sawChange = true;
		} else {
			const context = line.startsWith( ' ' ) ? line.slice( 1 ) : line;
			last( current.before ).push( context );
			last( current.after ).push( context );
		}
	}

	const files = drafts
		.map( ( draft ) => ( {
			// `+++` names the file as it exists now; fall back for deletions.
			path: draft.newPath ?? draft.oldPath ?? draft.headerPath,
			before: draft.before.map( ( lines ) => lines.join( '\n' ) ),
			after: draft.after.map( ( lines ) => lines.join( '\n' ) ),
		} ) )
		.filter( ( file ) => hasContent( file.before ) || hasContent( file.after ) );

	return { files, looksLikeDiff: sawChange };
}

function last< T >( groups: T[] ): T {
	return groups[ groups.length - 1 ];
}

function hasContent( segments: string[] ): boolean {
	return segments.some( ( segment ) => segment.trim() !== '' );
}

function pathFromHeader( line: string ): string | null {
	const match = /^diff --git a\/(.+?) b\/(.+)$/.exec( line );
	return match ? match[ 2 ] : null;
}

/** Strips Git's a//b/ prefixes and the trailing timestamp plain diff adds. */
function cleanPath( value: string ): string | null {
	const path = value.split( '\t' )[ 0 ].trim();
	if ( path === '/dev/null' ) {
		return null;
	}
	return path.replace( /^[ab]\//, '' );
}
