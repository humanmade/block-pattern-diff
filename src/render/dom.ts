/** Everything rendered comes from pasted markup, so build nodes rather than HTML strings. */
export function el< K extends keyof HTMLElementTagNameMap >(
	tag: K,
	className?: string,
	...children: Array< Node | string | null | false >
): HTMLElementTagNameMap[ K ] {
	const node = document.createElement( tag );
	if ( className ) {
		node.className = className;
	}
	for ( const child of children ) {
		if ( child === null || child === false ) {
			continue;
		}
		node.append( typeof child === 'string' ? document.createTextNode( child ) : child );
	}
	return node;
}
