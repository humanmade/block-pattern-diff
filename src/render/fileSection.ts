import type { DiffStats } from '../lib/merge';
import { el } from './dom';

const STAT_ORDER: Array< keyof DiffStats > = [ 'added', 'removed', 'changed', 'moved' ];

/** Chips reading "1 added  1 changed", omitting anything at zero. */
export function statChips( counts: DiffStats ): Node[] {
	const parts: Node[] = [];
	for ( const name of STAT_ORDER ) {
		if ( ! counts[ name ] ) {
			continue;
		}
		parts.push(
			el( 'span', `s-${ name }`, el( 'b', undefined, String( counts[ name ] ) ), ` ${ name }` ),
			document.createTextNode( '  ' )
		);
	}
	parts.push( document.createTextNode( `${ counts.unchanged } unchanged` ) );
	return parts;
}

/**
 * Wraps one file's diff in a collapsible section. Used only when the paste
 * held more than one file; a single file renders bare.
 */
export function fileSection(
	path: string | null,
	counts: DiffStats,
	hunks: number,
	body: HTMLElement
): HTMLElement {
	const summary = el(
		'summary',
		'file__head',
		el( 'span', 'file__path', path ?? 'Pasted markup' ),
		el( 'span', 'file__stats', ...statChips( counts ) )
	);

	const section = el( 'details', 'file', summary );
	( section as HTMLDetailsElement ).open = true;

	if ( hunks > 1 ) {
		section.append(
			el(
				'p',
				'file__note',
				`${ hunks } hunks. Each is parsed on its own and shown in order; the file's content between them is not in the paste.`
			)
		);
	}
	section.append( el( 'div', 'file__body', body ) );
	return section;
}
