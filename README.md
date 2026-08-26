# Block Pattern Diff

Paste a diff of WordPress block pattern markup and get a hierarchical view of what changed. Both sides are re-parsed as blocks and compared as trees, so re-nesting and migrated attributes read as moves rather than as a wholesale rewrite. Whitespace-only differences are ignored.

Use it at [humanmade.github.io/block-pattern-diff](https://humanmade.github.io/block-pattern-diff/).

## Why

Serialized block markup is machine-generated, deeply nested, and written on very long lines. A line-based diff of it is close to unreadable. Wrapping one group in another rewrites every line beneath it, and the single attribute that actually changed sits somewhere inside a 900-character line.

This tool answers the questions a line diff can't: which block moved, which parent it moved into, and which attributes came with it.

## How to use it

1. Copy a diff from a pull request or from `git diff` and paste it into the **Paste a diff** tab. Git and hunk headers are fine to include, and a diff covering several files gets one collapsible view per file.
2. If the hunk is too fragmentary to read, or if its content confuses the `+` and `-` prefixes, switch to the **Before / after** tab and paste both versions of the pattern in full.
3. Read the result as a **Unified tree**, which shows each block once at its new location with a stub where it used to be, or **Side by side**, which puts the two trees in columns indented by their own depth.

Toggle **Unchanged blocks** to hide everything that didn't move or change, and **All attributes** to see a block's unchanged attributes alongside its changed ones.

## Linking to a diff

The tool reads a diff out of the URL, so a CI job can post a comment that links straight to a rendered view. Use **Copy link** in the toolbar to produce one by hand.

Query parameters, all optional:

| Key | Holds |
| --- | --- |
| `d` | A unified diff, opened in the **Paste a diff** tab |
| `a`, `b` | Before and after markup, opened in the **Before / after** tab |
| `view` | `unified` or `sbs` |

Payloads are gzipped, then base64url-encoded, then prefixed with `z`. Compression is not an optimisation here: block markup is repetitive enough that a 20-file paste encodes to under 1.5 kB, where plain base64 of the same paste runs past 60 kB and would not survive as a link. A payload prefixed `u` instead of `z` is read as plain base64url, which is easier to produce by hand.

Building a link needs no dependencies on Node 18 or newer:

```js
function shareLink( diff, base = 'https://humanmade.github.io/block-pattern-diff/' ) {
	const gzip = new CompressionStream( 'gzip' );
	const writer = gzip.writable.getWriter();
	writer.write( new TextEncoder().encode( diff ) );
	writer.close();
	return new Response( gzip.readable )
		.arrayBuffer()
		.then( ( buf ) => `${ base }?d=z${ Buffer.from( buf ).toString( 'base64url' ) }` );
}
```

A link that can't be decoded says so in the interface rather than opening an empty form.

## How it works

Six stages: split the paste into files and hunks, repair the block delimiters each hunk cuts through, parse both sides into normalized trees, match those trees, detect attributes that jumped between blocks, then merge everything into one structure that both views render from.

Files and hunks are diffed separately on purpose. Anything not contiguous in the original file would otherwise be matched as though it were, which produces wrong answers rather than untidy ones.

For the details, including why the delimiter repair isn't optional and how the matcher scores candidates, see [docs/architecture.md](docs/architecture.md).

## Development

Styling consumes the Human Made design tokens. `src/brand-tokens.css` is a verbatim copy of `assets/tokens.css` from [hm-brand-guidelines](https://github.com/humanmade/hm-brand-guidelines); re-sync it by copying that file over this one rather than editing it here. `src/styles.css` holds everything specific to this tool and defines no colours of its own.

```sh
npm install
npm run dev     # local server
npm test        # unit tests, plus DOM tests under jsdom
npm run build   # type check and build to dist/
```

Pushes to `main` run the tests and deploy to GitHub Pages through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
