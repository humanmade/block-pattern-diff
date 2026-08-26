# Block Pattern Diff

Paste a diff of WordPress block pattern markup and get a hierarchical view of what changed. Both sides are re-parsed as blocks and compared as trees, so re-nesting and migrated attributes read as moves rather than as a wholesale rewrite. Whitespace-only differences are ignored.

Use it at [humanmade.github.io/block-pattern-diff](https://humanmade.github.io/block-pattern-diff/).

## Why

Serialized block markup is machine-generated, deeply nested, and written on very long lines. A line-based diff of it is close to unreadable. Wrapping one group in another rewrites every line beneath it, and the single attribute that actually changed sits somewhere inside a 900-character line.

This tool answers the questions a line diff can't: which block moved, which parent it moved into, and which attributes came with it.

## How to use it

1. Copy a diff hunk from a pull request or from `git diff` and paste it into the **Paste a diff** tab. Git and hunk headers are fine to include.
2. If the hunk is too fragmentary to read, or if its content confuses the `+` and `-` prefixes, switch to the **Before / after** tab and paste both versions of the pattern in full.
3. Read the result as a **Unified tree**, which shows each block once at its new location with a stub where it used to be, or **Side by side**, which puts the two trees in columns indented by their own depth.

Toggle **Unchanged blocks** to hide everything that didn't move or change, and **All attributes** to see a block's unchanged attributes alongside its changed ones.

## How it works

Six stages: split the paste into two documents, repair the block delimiters the hunk cuts through, parse both sides into normalized trees, match those trees, detect attributes that jumped between blocks, then merge everything into one structure that both views render from.

For the details, including why the delimiter repair isn't optional and how the matcher scores candidates, see [docs/architecture.md](docs/architecture.md).

## Development

```sh
npm install
npm run dev     # local server
npm test        # unit tests, plus DOM tests under jsdom
npm run build   # type check and build to dist/
```

Pushes to `main` run the tests and deploy to GitHub Pages through [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
