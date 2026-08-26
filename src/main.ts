import './styles.css';
import { parseDocument, type ParsedDocument } from './lib/blocks';
import { splitUnifiedDiff } from './lib/diffInput';
import { EXAMPLE_DIFF } from './lib/example';
import { mergeTrees, summarize } from './lib/merge';
import { diffTrees } from './lib/treeDiff';
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

function sources(): { before: string; after: string; warnings: string[] } {
	if ( mode === 'panes' ) {
		return { before: beforeInput.value, after: afterInput.value, warnings: [] };
	}
	const split = splitUnifiedDiff( diffInput.value );
	const warnings =
		diffInput.value.trim() && ! split.looksLikeDiff
			? [
					'No + or - lines here, so both sides are identical. Use the Before / after tab to compare two versions of a pattern.',
			  ]
			: [];
	return { before: split.before, after: split.after, warnings };
}

/** Blocks we had to invent delimiters for are flagged in the tree; say so once, up top. */
function truncationWarning( before: ParsedDocument, after: ParsedDocument ): string | null {
	const count =
		before.unopened.length +
		before.unclosed.length +
		after.unopened.length +
		after.unclosed.length;
	if ( ! count ) {
		return null;
	}
	return `The paste cuts through ${ count } block delimiter${
		count === 1 ? '' : 's'
	}. Those blocks were closed off so the hierarchy could be read, and are marked as extending beyond the pasted hunk.`;
}

function render(): void {
	const { before: beforeSource, after: afterSource, warnings } = sources();

	if ( ! beforeSource.trim() && ! afterSource.trim() ) {
		output.replaceChildren();
		stats.textContent = '';
		setNotice( [] );
		return;
	}

	const before = parseDocument( beforeSource, 'a' );
	const after = parseDocument( afterSource, 'b' );
	const diff = diffTrees( before, after );
	const rows = mergeTrees( before, after, diff );

	const truncated = truncationWarning( before, after );
	setNotice( truncated ? [ ...warnings, truncated ] : warnings );

	const options: ViewOptions = {
		showUnchanged: showUnchanged.checked,
		showAllAttrs: showAllAttrs.checked,
	};
	output.replaceChildren(
		view === 'unified'
			? renderUnified( rows, diff, options )
			: renderSideBySide( rows, options )
	);

	const counts = summarize( rows );
	stats.replaceChildren();
	const parts: Array< [ string, number ] > = [
		[ 'added', counts.added ],
		[ 'removed', counts.removed ],
		[ 'changed', counts.changed ],
		[ 'moved', counts.moved ],
	];
	for ( const [ name, value ] of parts.filter( ( [ , value ] ) => value > 0 ) ) {
		const chip = document.createElement( 'span' );
		chip.className = `s-${ name }`;
		chip.append( Object.assign( document.createElement( 'b' ), { textContent: String( value ) } ) );
		chip.append( ` ${ name }` );
		stats.append( chip, '  ' );
	}
	stats.append( `${ counts.unchanged } unchanged` );
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
