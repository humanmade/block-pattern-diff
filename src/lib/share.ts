/**
 * Encodes a paste into something that survives a URL, so a CI job can link
 * straight to a rendered diff.
 *
 * Block markup is long and highly repetitive: plain base64 of a 20-file
 * paste runs past 60 kB, well beyond what links reliably survive, while
 * gzipping first brings the same paste under 1.5 kB. So compression is the
 * default rather than an optimisation.
 *
 * Wire format is a one-character scheme prefix followed by base64url:
 *
 *   z<base64url>   gzip-compressed UTF-8   (what encodeShare produces)
 *   u<base64url>   plain UTF-8             (for links built by hand)
 *
 * Both `CompressionStream` and `btoa` exist in browsers and in Node, so a
 * GitHub Action can produce these links without pulling in a dependency.
 */

export const GZIP = 'z';
export const PLAIN = 'u';

/** A hostile link should not be able to hand the parser an unbounded string. */
export const MAX_DECODED_BYTES = 2 * 1024 * 1024;

export class ShareDecodeError extends Error {}

export async function encodeShare( text: string ): Promise< string > {
	const bytes = new TextEncoder().encode( text );
	return GZIP + toBase64Url( await gzip( bytes ) );
}

export async function decodeShare( value: string ): Promise< string > {
	const scheme = value.slice( 0, 1 );
	if ( scheme !== GZIP && scheme !== PLAIN ) {
		throw new ShareDecodeError( `Unknown encoding "${ scheme }"` );
	}

	let bytes: Uint8Array< ArrayBuffer >;
	try {
		bytes = fromBase64Url( value.slice( 1 ) );
	} catch {
		throw new ShareDecodeError( 'Not valid base64url' );
	}

	if ( scheme === GZIP ) {
		try {
			bytes = await gunzip( bytes );
		} catch {
			throw new ShareDecodeError( 'Not valid gzip data' );
		}
	}

	if ( bytes.length > MAX_DECODED_BYTES ) {
		throw new ShareDecodeError( 'Payload is too large' );
	}
	return new TextDecoder().decode( bytes );
}

async function gzip( bytes: Uint8Array< ArrayBuffer > ): Promise< Uint8Array< ArrayBuffer > > {
	return pipe( bytes, new CompressionStream( 'gzip' ) );
}

async function gunzip( bytes: Uint8Array< ArrayBuffer > ): Promise< Uint8Array< ArrayBuffer > > {
	return pipe( bytes, new DecompressionStream( 'gzip' ) );
}

async function pipe(
	bytes: Uint8Array< ArrayBuffer >,
	transform: CompressionStream | DecompressionStream
): Promise< Uint8Array< ArrayBuffer > > {
	const writer = transform.writable.getWriter();
	// Not awaited: these only settle once the reader below drains the stream.
	// On malformed input both sides reject, so the write-side rejection is
	// swallowed here and the read below is left to report the failure.
	writer.write( bytes ).catch( () => {} );
	writer.close().catch( () => {} );
	return new Uint8Array( await new Response( transform.readable ).arrayBuffer() );
}

function toBase64Url( bytes: Uint8Array< ArrayBuffer > ): string {
	let binary = '';
	// Chunked, because spreading a large array into fromCharCode overflows.
	const CHUNK = 0x8000;
	for ( let i = 0; i < bytes.length; i += CHUNK ) {
		binary += String.fromCharCode( ...bytes.subarray( i, i + CHUNK ) );
	}
	return btoa( binary ).replace( /\+/g, '-' ).replace( /\//g, '_' ).replace( /=+$/, '' );
}

function fromBase64Url( value: string ): Uint8Array< ArrayBuffer > {
	if ( ! /^[A-Za-z0-9_-]*$/.test( value ) ) {
		throw new Error( 'unexpected characters' );
	}
	const standard = value.replace( /-/g, '+' ).replace( /_/g, '/' );
	const remainder = standard.length % 4;
	const padded = remainder ? standard + '='.repeat( 4 - remainder ) : standard;
	const binary = atob( padded );
	const bytes = new Uint8Array( binary.length );
	for ( let i = 0; i < binary.length; i++ ) {
		bytes[ i ] = binary.charCodeAt( i );
	}
	return bytes;
}

/* ── URL layer ───────────────────────────────────────────────── */

export interface SharedState {
	/** A unified diff, for the diff tab. */
	diff?: string;
	/** Full markup for the before/after tab. Either may stand alone. */
	before?: string;
	after?: string;
	view?: 'unified' | 'sbs';
}

/** Query keys, kept short because they end up inside a comment link. */
const PARAM = { diff: 'd', before: 'a', after: 'b', view: 'view' } as const;

/**
 * Reads shared state out of a query string. Throws ShareDecodeError if a
 * payload is present but unreadable, so the interface can say so rather than
 * silently showing an empty form.
 */
export async function readSharedState( search: string ): Promise< SharedState | null > {
	const params = new URLSearchParams( search );
	const state: SharedState = {};

	for ( const key of [ 'diff', 'before', 'after' ] as const ) {
		const value = params.get( PARAM[ key ] );
		if ( value ) {
			state[ key ] = await decodeShare( value );
		}
	}

	const view = params.get( PARAM.view );
	if ( view === 'unified' || view === 'sbs' ) {
		state.view = view;
	}

	return state.diff === undefined &&
		state.before === undefined &&
		state.after === undefined
		? null
		: state;
}

/** Builds a link that hydrates the form back into this state. */
export async function buildSharedUrl( base: string, state: SharedState ): Promise< string > {
	const url = new URL( base );
	url.search = '';
	for ( const key of [ 'diff', 'before', 'after' ] as const ) {
		const value = state[ key ];
		if ( value && value.trim() ) {
			url.searchParams.set( PARAM[ key ], await encodeShare( value ) );
		}
	}
	if ( state.view ) {
		url.searchParams.set( PARAM.view, state.view );
	}
	return url.toString();
}
