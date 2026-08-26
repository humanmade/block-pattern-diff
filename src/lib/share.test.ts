import { describe, expect, it } from 'vitest';
import { EXAMPLE_DIFF } from './example';
import {
	buildSharedUrl,
	decodeShare,
	encodeShare,
	readSharedState,
	ShareDecodeError,
} from './share';

describe( 'share encoding', () => {
	it( 'round-trips a diff', async () => {
		expect( await decodeShare( await encodeShare( EXAMPLE_DIFF ) ) ).toBe( EXAMPLE_DIFF );
	} );

	it( 'round-trips text that is not ASCII', async () => {
		const text = '<!-- wp:paragraph --><p>Grüße — “smart” quotes, emoji 🎉</p>';
		expect( await decodeShare( await encodeShare( text ) ) ).toBe( text );
	} );

	it( 'produces base64url with no characters needing escaping', async () => {
		const encoded = await encodeShare( EXAMPLE_DIFF );
		expect( encoded ).toMatch( /^z[A-Za-z0-9_-]+$/ );
		expect( encodeURIComponent( encoded ) ).toBe( encoded );
	} );

	it( 'compresses enough for a link to survive', async () => {
		// Plain base64 of a paste this size runs past 60 kB.
		const big = Array.from( { length: 20 }, () => EXAMPLE_DIFF ).join( '\n' );
		const encoded = await encodeShare( big );
		expect( big.length ).toBeGreaterThan( 40000 );
		expect( encoded.length ).toBeLessThan( 2000 );
	} );

	it( 'accepts a hand-built uncompressed payload', async () => {
		// Built the way a shell script or Action would, without this module.
		const plain =
			'u' +
			btoa( '<!-- wp:spacer /-->' )
				.replace( /\+/g, '-' )
				.replace( /\//g, '_' )
				.replace( /=+$/, '' );
		expect( await decodeShare( plain ) ).toBe( '<!-- wp:spacer /-->' );
	} );

	it( 'rejects an unknown scheme, bad base64 and non-gzip bytes', async () => {
		await expect( decodeShare( 'q123' ) ).rejects.toThrow( ShareDecodeError );
		await expect( decodeShare( 'z!!!!' ) ).rejects.toThrow( ShareDecodeError );
		await expect( decodeShare( 'zAAAAAAAA' ) ).rejects.toThrow( ShareDecodeError );
	} );
} );

describe( 'share URLs', () => {
	it( 'round-trips through a URL', async () => {
		const url = await buildSharedUrl( 'https://example.test/tool/', {
			diff: EXAMPLE_DIFF,
			view: 'sbs',
		} );
		const state = await readSharedState( new URL( url ).search );
		expect( state?.diff ).toBe( EXAMPLE_DIFF );
		expect( state?.view ).toBe( 'sbs' );
		expect( state?.before ).toBeUndefined();
	} );

	it( 'carries a before/after pair', async () => {
		const url = await buildSharedUrl( 'https://example.test/', {
			before: '<!-- wp:spacer /-->',
			after: '<!-- wp:separator /-->',
		} );
		const state = await readSharedState( new URL( url ).search );
		expect( state?.before ).toBe( '<!-- wp:spacer /-->' );
		expect( state?.after ).toBe( '<!-- wp:separator /-->' );
	} );

	it( 'drops empty fields and any pre-existing query', async () => {
		const url = await buildSharedUrl( 'https://example.test/?stale=1', {
			diff: EXAMPLE_DIFF,
			before: '   ',
		} );
		expect( url ).not.toContain( 'stale' );
		expect( url ).not.toContain( 'a=' );
	} );

	it( 'returns null when the URL carries no payload', async () => {
		expect( await readSharedState( '' ) ).toBe( null );
		expect( await readSharedState( '?view=sbs' ) ).toBe( null );
	} );

	it( 'surfaces a corrupt payload instead of hydrating an empty form', async () => {
		await expect( readSharedState( '?d=zzzzz' ) ).rejects.toThrow( ShareDecodeError );
	} );
} );
