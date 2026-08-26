// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDocument } from '../lib/blocks';
import { splitUnifiedDiff } from '../lib/diffInput';
import { EXAMPLE_DIFF } from '../lib/example';
import { mergeTrees } from '../lib/merge';
import { diffTrees } from '../lib/treeDiff';
import { renderSideBySide, renderUnified } from './views';

function build( source: string ) {
	const input = splitUnifiedDiff( source );
	const before = parseDocument( input.before, 'a' );
	const after = parseDocument( input.after, 'b' );
	const diff = diffTrees( before, after );
	return { rows: mergeTrees( before, after, diff ), diff };
}

const OPTIONS = { showUnchanged: true, showAllAttrs: false };

describe( 'renderUnified', () => {
	it( 'names where a block moved from and to', () => {
		const { rows, diff } = build( EXAMPLE_DIFF );
		const text = renderUnified( rows, diff, OPTIONS ).textContent ?? '';
		expect( text ).toContain( 'moved to group "Featured stories well"' );
		expect( text ).toContain( 'moved here from the top level' );
	} );

	it( 'keeps the markup badge off the move stub', () => {
		const { rows, diff } = build( EXAMPLE_DIFF );
		const root = renderUnified( rows, diff, OPTIONS );
		const stub = root.querySelector( '.row--movedout .row__head' );
		expect( stub?.textContent ).toContain( 'moved to' );
		expect( stub?.querySelector( '.note--markup' ) ).toBe( null );
	} );

	it( 'shows the attribute that was retargeted onto the new wrapper', () => {
		const { rows, diff } = build( EXAMPLE_DIFF );
		const root = renderUnified( rows, diff, OPTIONS );
		const align = [ ...root.querySelectorAll( '.attr' ) ].filter(
			( node ) => node.querySelector( '.attr__path' )?.textContent === 'align'
		);
		expect( align.length ).toBeGreaterThan( 0 );
		expect( align.some( ( node ) => node.textContent?.includes( 'retargeted' ) ) ).toBe( true );
	} );

	it( 'word-diffs the wrapper markup instead of dumping both lines', () => {
		const { rows, diff } = build( EXAMPLE_DIFF );
		const root = renderUnified( rows, diff, OPTIONS );
		const removed = [ ...root.querySelectorAll( '.markup .w--remove' ) ].map( ( node ) =>
			node.textContent?.trim()
		);
		expect( removed ).toContain( 'alignwide' );
	} );

	it( 'hides untouched blocks when asked', () => {
		const { rows, diff } = build( EXAMPLE_DIFF );
		const shown = renderUnified( rows, diff, { ...OPTIONS, showUnchanged: false } );
		expect( shown.textContent ).not.toContain( 'heading' );
		expect( renderUnified( rows, diff, OPTIONS ).textContent ).toContain( 'heading' );
	} );

	it( 'reports an all-unchanged diff as having nothing to show', () => {
		const { rows, diff } = build( '<!-- wp:heading --><h2>x</h2><!-- /wp:heading -->' );
		const shown = renderUnified( rows, diff, { ...OPTIONS, showUnchanged: false } );
		expect( shown.textContent ).toBe( 'No changes to show.' );
	} );
} );

describe( 'renderSideBySide', () => {
	it( 'puts a re-parented block in the right column only, with a stub on the left', () => {
		const { rows } = build( EXAMPLE_DIFF );
		const grid = renderSideBySide( rows, OPTIONS );
		const cells = [ ...grid.querySelectorAll( '.cell' ) ];

		const stub = cells.find( ( node ) => node.textContent?.includes( 'moved to group' ) );
		expect( stub?.classList.contains( 'cell--before' ) ).toBe( true );
		expect( stub?.nextElementSibling?.classList.contains( 'cell--empty' ) ).toBe( true );

		const landed = cells.find( ( node ) => node.textContent?.includes( 'moved here from' ) );
		expect( landed?.classList.contains( 'cell--after' ) ).toBe( true );
		expect( landed?.previousElementSibling?.classList.contains( 'cell--empty' ) ).toBe( true );
	} );

	it( 'indents each side by its own depth', () => {
		const { rows } = build( EXAMPLE_DIFF );
		const grid = renderSideBySide( rows, OPTIONS );
		const landed = [ ...grid.querySelectorAll< HTMLElement >( '.cell' ) ].find( ( node ) =>
			node.textContent?.includes( 'moved here from' )
		);
		expect( landed?.style.getPropertyValue( '--depth' ) ).toBe( '1' );
	} );
} );
