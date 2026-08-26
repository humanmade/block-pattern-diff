import './brand-tokens.css';
import './styles.css';
import { parseDocument, type ParsedDocument } from './lib/blocks';
import { splitUnifiedDiff, type DiffFile } from './lib/diffInput';
import { EXAMPLE_DIFF } from './lib/example';
import { mergeTrees, summarize, type DiffStats } from './lib/merge';
import { diffTrees } from './lib/treeDiff';
import { fileSection, statChips } from './render/fileSection';
import { renderSideBySide, renderUnified, type ViewOptions } from './render/views';

type Mode = 'diff' | 'panes';
type View = 'unified' | 'sbs';

const $ = < T extends HTMLElement >( selector: string ): T =>
	document.querySelector( selector ) as T;

const diffInput = $< HTMLTextAreaElement >( '#diff-input' );
const beforeInput = $< HTMLTextAreaElement >( '#before-input' );
const afterInput = $< HTMLTextAreaElement >( '#after-input' );
const output = $< HTMLDivElement >( '#output' );
const notice = $< HTMLParagraphElement >( '#notice' );
const stats = $< HTMLParagraphElement >( '#stats' );
const showUnchanged = $< HTMLInputElement >( '#show-unchanged' );
const showAllAttrs = $< HTMLInputElement >( '#show-all-attrs' );

let mode: Mode = 'diff';
let view: View = 'unified';

function sources(): { files: DiffFile[]; warnings: string[] } {
	if ( mode === 'panes' ) {
		return {
			files: [ { path: null, before: [ beforeInput.value ], after: [ afterInput.value ] } ],
			warnings: [],
		};
	}
	const split = splitUnifiedDiff( diffInput.value );
	const warnings =
		diffInput.value.trim() && ! split.looksLikeDiff
			? [
					'No + or - lines here, so both sides are identical. Use the Before / after tab to compare two versions of a pattern.',
			  ]
			: [];
	return { files: split.files, warnings };
}

/** Blocks we had to invent delimiters for are flagged in the tree; say so once, up top. */
function truncationWarning( documents: ParsedDocument[] ): string | null {
	const count = documents.reduce(
		( total, doc ) => total + doc.unopened.length + doc.unclosed.length,
		0
	);
	if ( ! count ) {
		return null;
	}
	return `The paste cuts through ${ count } block delimiter${
		count === 1 ? '' : 's'
	}. Those blocks were closed off so the hierarchy could be read, and are marked as extending beyond the pasted hunk.`;
}

function render(): void {
	const { files, warnings } = sources();
	const usable = files.filter( ( file ) => hasContent( file.before ) || hasContent( file.after ) );

	if ( ! usable.length ) {
		output.replaceChildren();
		stats.textContent = '';
		setNotice( warnings );
		return;
	}

	const options: ViewOptions = {
		showUnchanged: showUnchanged.checked,
		showAllAttrs: showAllAttrs.checked,
	};
	const totals: DiffStats = { added: 0, removed: 0, changed: 0, moved: 0, unchanged: 0 };
	const documents: ParsedDocument[] = [];
	const sections: HTMLElement[] = [];

	// Each file is parsed and matched on its own. Matching across files would
	// pair a block deleted from one with an identical block added to another.
	for ( const file of usable ) {
		const before = parseDocument( file.before, 'a' );
		const after = parseDocument( file.after, 'b' );
		documents.push( before, after );

		const diff = diffTrees( before, after );
		const rows = mergeTrees( before, after, diff );
		const counts = summarize( rows );
		for ( const key of Object.keys( totals ) as Array< keyof DiffStats > ) {
			totals[ key ] += counts[ key ];
		}

		const body =
			view === 'unified'
				? renderUnified( rows, diff, options )
				: renderSideBySide( rows, options );
		sections.push(
			usable.length > 1 ? fileSection( file.path, counts, file.before.length, body ) : body
		);
	}

	output.replaceChildren( ...sections );

	const truncated = truncationWarning( documents );
	setNotice( truncated ? [ ...warnings, truncated ] : warnings );

	stats.replaceChildren( ...statChips( totals ) );
	if ( usable.length > 1 ) {
		stats.prepend( `${ usable.length } files  ` );
	}
}

function hasContent( segments: string[] ): boolean {
	return segments.some( ( segment ) => segment.trim() !== '' );
}

function setNotice( messages: string[] ): void {
	notice.textContent = messages.join( ' ' );
	notice.classList.toggle( 'is-hidden', ! messages.length );
}

// Highlight a moved block and the stub it left behind together.
output.addEventListener( 'mouseover', ( event ) => {
	const target = ( event.target as HTMLElement ).closest< HTMLElement >( '[data-pair]' );
	document
		.querySelectorAll( '.is-linked' )
		.forEach( ( node ) => node.classList.remove( 'is-linked' ) );
	if ( ! target?.dataset.pair ) {
		return;
	}
	document
		.querySelectorAll( `[data-pair="${ CSS.escape( target.dataset.pair ) }"]` )
		.forEach( ( node ) => node.classList.add( 'is-linked' ) );
} );

let pending: number | undefined;
function scheduleRender(): void {
	window.clearTimeout( pending );
	pending = window.setTimeout( render, 120 );
}

for ( const field of [ diffInput, beforeInput, afterInput ] ) {
	field.addEventListener( 'input', scheduleRender );
}
for ( const field of [ showUnchanged, showAllAttrs ] ) {
	field.addEventListener( 'change', render );
}

document.querySelectorAll< HTMLButtonElement >( '.tabs .tab' ).forEach( ( tab ) => {
	tab.addEventListener( 'click', () => {
		mode = tab.dataset.mode as Mode;
		document
			.querySelectorAll( '.tabs .tab' )
			.forEach( ( other ) => other.classList.toggle( 'is-active', other === tab ) );
		document.querySelectorAll< HTMLElement >( '[data-panel]' ).forEach( ( panel ) => {
			panel.classList.toggle( 'is-hidden', panel.dataset.panel !== mode );
		} );
		render();
	} );
} );

document.querySelectorAll< HTMLButtonElement >( '.views .tab' ).forEach( ( tab ) => {
	tab.addEventListener( 'click', () => {
		view = tab.dataset.view as View;
		document
			.querySelectorAll( '.views .tab' )
			.forEach( ( other ) => other.classList.toggle( 'is-active', other === tab ) );
		render();
	} );
} );

$< HTMLButtonElement >( '#load-example' ).addEventListener( 'click', () => {
	diffInput.value = EXAMPLE_DIFF;
	( document.querySelector( '.tabs .tab[data-mode="diff"]' ) as HTMLButtonElement ).click();
} );

$< HTMLButtonElement >( '#clear' ).addEventListener( 'click', () => {
	diffInput.value = '';
	beforeInput.value = '';
	afterInput.value = '';
	render();
} );

render();
