/**
 * A pasted diff hunk is almost never a complete document: it usually opens
 * blocks it never closes, or closes blocks it never opened. Fed such a
 * fragment, the WordPress parser's error recovery flattens the tree — inner
 * blocks are emitted as siblings — which destroys exactly the nesting this
 * tool exists to show. So we balance the delimiters first and remember what
 * we had to invent, in order to label those blocks as truncated.
 */

/** Mirrors the tokenizer in @wordpress/block-serialization-default-parser. */
const TOKEN =
	/<!--\s+(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)\s+({(?:(?!}\s+\/?-->)[\s\S])*?}\s+)?(\/)?-->/g;

export interface BalanceResult {
	text: string;
	/** Blocks the hunk closes but never opens, outermost first. */
	unopened: string[];
	/** Blocks the hunk opens but never closes, outermost first. */
	unclosed: string[];
}

export function balance( source: string ): BalanceResult {
	const stack: string[] = [];
	const closedWithoutOpen: string[] = [];

	TOKEN.lastIndex = 0;
	let token: RegExpExecArray | null;
	while ( ( token = TOKEN.exec( source ) ) !== null ) {
		const [ , closer, namespace, name, , selfClosing ] = token;
		if ( selfClosing ) {
			continue;
		}
		const blockName = ( namespace ?? 'core/' ) + name;
		if ( ! closer ) {
			stack.push( blockName );
			continue;
		}
		const depth = stack.lastIndexOf( blockName );
		if ( depth === -1 ) {
			closedWithoutOpen.push( blockName );
		} else {
			stack.length = depth;
		}
	}

	// The first orphan closer is the innermost of the missing ancestors, so
	// reversing gives the order those ancestors have to be opened in.
	const unopened = closedWithoutOpen.slice().reverse();
	const unclosed = stack.slice();

	const opener = ( name: string ) => `<!-- wp:${ shorten( name ) } -->`;
	const closerFor = ( name: string ) => `<!-- /wp:${ shorten( name ) } -->`;

	const text = [
		...unopened.map( opener ),
		source,
		...unclosed.slice().reverse().map( closerFor ),
	].join( '\n' );

	return { text, unopened, unclosed };
}

/** WordPress omits the `core/` namespace in serialized markup. */
function shorten( blockName: string ): string {
	return blockName.startsWith( 'core/' ) ? blockName.slice( 5 ) : blockName;
}
