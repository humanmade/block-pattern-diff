/**
 * Small text utilities shared by the parser and the diff.
 */

/**
 * Collapse whitespace runs to a single space and trim, so that pure-whitespace
 * differences (re-indentation, wrapped lines) never register as changes.
 */
export function normalizeWhitespace( value: string ): string {
	return value.replace( /\s+/g, ' ' ).trim();
}

/** FNV-1a, used only to key identical subtrees. Not security relevant. */
export function hash( value: string ): string {
	let h = 0x811c9dc5;
	for ( let i = 0; i < value.length; i++ ) {
		h ^= value.charCodeAt( i );
		h = Math.imul( h, 0x01000193 );
	}
	return ( h >>> 0 ).toString( 16 );
}

/** Deterministic JSON: object keys sorted, so key order never affects equality. */
export function stableStringify( value: unknown ): string {
	if ( value === null || typeof value !== 'object' ) {
		return JSON.stringify( value ) ?? 'null';
	}
	if ( Array.isArray( value ) ) {
		return '[' + value.map( stableStringify ).join( ',' ) + ']';
	}
	const entries = Object.entries( value as Record< string, unknown > ).sort(
		( a, b ) => ( a[ 0 ] < b[ 0 ] ? -1 : 1 )
	);
	return (
		'{' +
		entries
			.map( ( [ key, val ] ) => JSON.stringify( key ) + ':' + stableStringify( val ) )
			.join( ',' ) +
		'}'
	);
}

export function deepEqual( a: unknown, b: unknown ): boolean {
	return stableStringify( a ) === stableStringify( b );
}

/**
 * Dice coefficient over character bigrams: a cheap 0..1 similarity that
 * tolerates insertions anywhere in the string.
 */
export function similarity( a: string, b: string ): number {
	if ( a === b ) {
		return 1;
	}
	if ( ! a.length || ! b.length ) {
		return 0;
	}
	const bigrams = ( value: string ): Map< string, number > => {
		const map = new Map< string, number >();
		for ( let i = 0; i < value.length - 1; i++ ) {
			const gram = value.slice( i, i + 2 );
			map.set( gram, ( map.get( gram ) ?? 0 ) + 1 );
		}
		return map;
	};
	const left = bigrams( a );
	const right = bigrams( b );
	let shared = 0;
	for ( const [ gram, count ] of left ) {
		shared += Math.min( count, right.get( gram ) ?? 0 );
	}
	const total = a.length - 1 + ( b.length - 1 );
	return total > 0 ? ( 2 * shared ) / total : 0;
}
