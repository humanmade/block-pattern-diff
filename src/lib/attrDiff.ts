import { deepEqual, stableStringify } from './text';

export type AttrStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface AttrRow {
	/** Dotted path, e.g. `style.spacing.padding.top`. */
	path: string;
	status: AttrStatus;
	before?: unknown;
	after?: unknown;
}

/**
 * Flattens to leaf paths so that a change deep inside `style` is reported at
 * the property that actually moved, not as a wholesale rewrite of `style`.
 * Arrays are leaves: element-wise paths produce more noise than signal.
 */
export function flattenAttrs(
	attrs: Record< string, unknown >,
	prefix = '',
	into = new Map< string, unknown >()
): Map< string, unknown > {
	for ( const [ key, value ] of Object.entries( attrs ) ) {
		const path = prefix ? `${ prefix }.${ key }` : key;
		if ( value !== null && typeof value === 'object' && ! Array.isArray( value ) ) {
			const nested = value as Record< string, unknown >;
			if ( Object.keys( nested ).length ) {
				flattenAttrs( nested, path, into );
				continue;
			}
		}
		into.set( path, value );
	}
	return into;
}

export function compareAttrs(
	before: Record< string, unknown >,
	after: Record< string, unknown >
): AttrRow[] {
	const left = flattenAttrs( before );
	const right = flattenAttrs( after );
	const paths = [ ...new Set( [ ...left.keys(), ...right.keys() ] ) ].sort();

	return paths.map( ( path ) => {
		const inLeft = left.has( path );
		const inRight = right.has( path );
		if ( inLeft && ! inRight ) {
			return { path, status: 'removed' as const, before: left.get( path ) };
		}
		if ( ! inLeft && inRight ) {
			return { path, status: 'added' as const, after: right.get( path ) };
		}
		const a = left.get( path );
		const b = right.get( path );
		return deepEqual( a, b )
			? { path, status: 'unchanged' as const, before: a, after: b }
			: { path, status: 'changed' as const, before: a, after: b };
	} );
}

/** Fraction of leaf attributes the two blocks agree on, 0..1. */
export function attrSimilarity(
	before: Record< string, unknown >,
	after: Record< string, unknown >
): number {
	const left = flattenAttrs( before );
	const right = flattenAttrs( after );
	if ( ! left.size && ! right.size ) {
		return 1;
	}
	let shared = 0;
	for ( const [ path, value ] of left ) {
		if ( right.has( path ) && deepEqual( value, right.get( path ) ) ) {
			shared++;
		}
	}
	return ( 2 * shared ) / ( left.size + right.size );
}

export function formatValue( value: unknown ): string {
	return typeof value === 'string' ? value : stableStringify( value );
}
