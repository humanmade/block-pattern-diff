# Architecture

This document describes how Block Pattern Diff turns a pasted diff of WordPress block pattern markup into a hierarchical view of what changed. Read it before changing the matching logic, because several stages depend on assumptions the earlier stages establish.

## Why a line diff isn't enough

Serialized block markup is machine-generated, deeply nested, and written on very long lines. Two properties of that format defeat a line-based diff:

- Wrapping one group in another re-indents and rewrites every line beneath it. A line diff reports the whole subtree as changed, even though nothing inside it moved relative to its parent.
- A block's attributes are JSON on the same line as the block delimiter. Changing one property rewrites a line that can run to several hundred characters, and the reader has to find the difference by eye.

Block Pattern Diff answers the questions a line diff can't: which block moved, which parent it moved into, and which attributes came with it.

## Pipeline overview

The tool runs six stages. Each one hands a data structure to the next.

| Stage | Module | Input | Output |
| --- | --- | --- | --- |
| 1. Split | `src/lib/diffInput.ts` | Pasted diff text | One entry per file, each holding its hunks |
| 2. Balance | `src/lib/balance.ts` | One markup document | Balanced markup, plus a record of what was invented |
| 3. Parse | `src/lib/blocks.ts` | Balanced markup | A normalized, hashed block tree per side |
| 4. Match | `src/lib/treeDiff.ts` | Two block trees | Node pairs, classified as added, removed, changed, or moved |
| 5. Attribute moves | `src/lib/treeDiff.ts` | Classified pairs | Attributes that jumped between blocks |
| 6. Merge | `src/lib/merge.ts` | Everything above | One tree holding both sides, ready to render |

## Stage 1: Split the pasted diff

A unified diff is a line-prefixed format, so reconstructing the two sides takes one pass. `splitUnifiedDiff()` sends lines that start with `-` to the before document, lines that start with `+` to the after document, and every other line to both. It discards Git headers such as `diff --git` and `index`.

Unprefixed lines count as context on both sides. This is deliberate: pastes that lose their leading context spaces are common, and treating them as context keeps those pastes usable.

The function reports whether it saw any `+` or `-` lines at all. If it saw none, the interface tells you the paste is plain markup rather than a diff, and points you at the before-and-after input tab.

### Regions that aren't contiguous must stay apart

The function returns a `DiffFile` per file, and each file keeps its hunks as separate strings. Both splits exist for the same reason: text that isn't contiguous in the original file must not be parsed as though it were.

`diff --git` starts a new file. Plain `diff -u` output has no such line, so a second `---` header also starts one. Paths come from the `+++` header, which names the file as it exists now, and fall back to `---` for deletions. Each `@@` line starts a new hunk segment.

Skipping either split produces wrong output, not just untidy output:

- **Across files.** If two files are concatenated, the matcher can pair blocks in one file with blocks in another. A block deleted from one file and added to another then pairs with itself, the deletion cancels the addition, and the tool reports that nothing changed.
- **Across hunks.** The file's own content sits between two hunks, and the paste doesn't include it. A block left open at the end of one hunk would adopt the blocks of the next, inventing nesting the file doesn't have. In practice this turns one changed block into a removal and an addition at different depths.

Blocks from different hunks therefore appear as siblings at the top level of the tree. That is not a claim that they are siblings in the file, only that their real relationship isn't in the paste. The interface notes the hunk count on any file that has more than one.

## Stage 2: Balance the block delimiters

This stage is load-bearing. Don't remove it.

A hunk is a window into the middle of a file, so it routinely opens a block it never closes, or closes a block it never opened. Given such a fragment, the error recovery in `@wordpress/block-serialization-default-parser` flattens the result: inner blocks come back as siblings of their parent, and the fragment's content appears twice. That destroys the nesting this tool exists to show.

`balance()` scans the block delimiters with a stack and repairs the fragment:

1. For each block left open at the end of the hunk, append a closing delimiter.
2. For each closing delimiter with no matching opener, prepend an opening delimiter. The first orphan closer is the innermost missing ancestor, so reverse the collected names to get the order in which to open them.
3. Ignore self-closing delimiters, such as `<!-- wp:spacer /-->`, because they open nothing.

The function returns the repaired text along with the names it had to invent. `parseDocument()` uses those counts to walk the left and right spines of the resulting tree and mark those blocks as truncated. The interface labels them "extends beyond the pasted hunk", so you can tell inferred nesting from nesting that was in the paste.

## Stage 3: Parse and normalize

`parseDocument()` takes one string per hunk, balances and parses each on its own, then places the results side by side at the top level. It uses `@wordpress/block-serialization-default-parser`, the parser WordPress itself uses. That package is published to npm and has no WordPress dependency.

The parser returns a block name, an attributes object, inner blocks, and `innerHTML`: the block's own wrapper markup with its children removed. Normalization then does four things:

- Collapses whitespace runs in the wrapper markup to a single space and trims it. This is where "ignore whitespace-only changes" comes from. Whitespace differences are gone before any comparison starts.
- Drops freeform nodes that normalize to an empty string. The newlines between blocks parse as unnamed blocks, and left in place they'd dominate the diff.
- Records a display label from `metadata.name`, falling back to `className`.
- Hashes each node together with its entire subtree, using FNV-1a over a deterministic JSON serialization. Sorting object keys during serialization means attribute order never affects equality.

## Stage 4: Match the trees

Matching runs in two passes, then classifies the result.

### Anchor pass

Any subtree whose hash appears on both sides is identical content. `matchIdenticalSubtrees()` pairs those first, largest subtree first, and adopts each pair's descendants by position. Because the hashes are equal, the descendants are guaranteed to line up.

When a hash appears more than once, the pass prefers the candidate at the same depth and index, on the grounds that it's the one that didn't move.

These pairs anchor the rest of the match.

### Similarity pass

Whatever remains is scored. For each unmatched block on the before side, `matchBySimilarity()` scores every unmatched block of the same type on the after side, then takes the best result above a threshold of `0.5`.

The score is a weighted blend of three facets:

| Facet | Weight | Measure |
| --- | --- | --- |
| Attributes | 0.35 | Fraction of leaf attribute paths that carry equal values |
| Wrapper markup | 0.25 | Dice coefficient over character bigrams |
| Children | 0.40 | Fraction of children already paired to each other |

Only facets that at least one of the two blocks has are counted, and the total is normalized by the weights that applied. Without this, a change to a block's only attribute would sink a block whose children and markup are untouched. A block whose parent already pairs with the candidate's parent gets a bonus of `0.1`.

The pass runs twice. The first run walks the before tree in post-order so that settled children inform their parents. The second walks it in pre-order so that settled parents inform their remaining children.

### Classification

For each pair, `diffTrees()` records:

- **Re-parent**, when the before block's parent doesn't pair with the after block's parent. A block moved to a top level that had no parent before, or gained one, counts here.
- **Reorder**, when the parents correspond but the block's rank among its *matched* siblings changed. Ranking against matched siblings only, rather than all siblings, stops an inserted or deleted sibling from marking everything after it as reordered.
- **Changed**, when any attribute differs or the normalized wrapper markup differs.

Blocks with no partner are added or removed, depending on which side they're on.

The returned `TreeDiff` exposes both a `byNode` map, keyed by nodes on either side, and a deduplicated `diffs` array. Use `diffs` when counting, because `byNode` holds one entry per node and therefore stores each pair twice.

## Stage 5: Detect attribute moves

Attributes are compared as flattened leaf paths, so a change inside a style object is reported at `style.spacing.padding.top` rather than as a rewrite of `style`. Arrays are treated as leaves, because element-wise paths produce more noise than signal.

`findAttrMoves()` collects every attribute that left a block and every attribute that appeared on one, including all attributes of removed and added blocks. It then pairs a departure with an arrival when both of these hold:

- The two share a leaf path.
- The two blocks are ancestor and descendant of each other, measured on the after tree. A departure from a block that no longer exists is anchored to its nearest surviving ancestor.

The relationship requirement is what makes the heuristic usable. Without it, any pattern containing two groups that both set `align` would report a false move.

Each match is reported in one of two tiers:

- `moved`: the value is identical. The property was carried onto another block verbatim.
- `retargeted`: the path is the same but the value changed. This is weaker evidence, and the interface labels it differently.

An arrival is claimed by at most one departure, and identical values are preferred over changed ones when several candidates compete.

## Stage 6: Merge and render

`mergeTrees()` produces one tree that holds both sides. The after tree's order is authoritative. Removed blocks are spliced back in at the position they held before, anchored relative to their matched siblings. A moved block leaves a stub, `moved-out`, at its old location; the block itself, along with its subtree, appears once at its new location.

Both views read from this structure:

- **Unified tree** walks it as a nested tree. Each row shows the block, its label, its changed attributes, and where it moved from or to.
- **Side by side** flattens it to rows, where each row fills a left cell, a right cell, or both. A re-parented block fills only the left cell at its stub row and only the right cell at its real row, so the jump between columns is visible. Each cell indents by its own side's depth, which is what makes a change in nesting depth legible.

When a block's wrapper markup changed, `wordDiff()` runs a longest-common-subsequence diff over whitespace-separated tokens. Splitting on whitespace makes each class name its own token, so a change reads as one struck-through word rather than as two near-identical 400-character lines.

All rendering builds DOM nodes rather than HTML strings, because every value on screen came from pasted input.

## Worked example

Given a hunk that wraps an existing group in a new one, the tool reports:

```
↳ group "Featured stories in region"       moved to group "Featured stories wrap"
▾ + group "Featured stories wrap"          extends beyond the pasted hunk
    align: full                            retargeted from group "Featured stories in region"
    layout.contentSize: 1270px
    layout.type: constrained
  ▾ ~ group "Featured stories in region"   moved here from the top level
      align: wide                          retargeted to group "Featured stories wrap"
      markup  <div class="wp-block-group alignwide has-white-color …
    · heading "is-style-h4"
```

One block added, one moved, one attribute retargeted, and a heading left alone. A line diff of the same hunk reports four rewritten lines.

The heading survives because it hashes identically and pairs during the anchor pass. The inner group survives because its heading child already paired, which carries the children facet of its similarity score.

## Sharing a diff in a URL

`src/lib/share.ts` encodes a paste into a query parameter so that a CI job can link to a rendered diff, and decodes one on load.

The wire format is a one-character scheme prefix followed by base64url:

- `z` — gzip-compressed UTF-8. This is what `encodeShare()` produces.
- `u` — plain UTF-8, for links assembled by hand or by a shell script.

Compression carries the feature rather than merely shrinking it. Plain base64 of a twenty-file paste runs past 60 kB, beyond what links reliably survive; the same paste gzips to under 1.5 kB, because serialized block markup repeats itself heavily. `CompressionStream` is available in browsers and in Node, so a GitHub Action can build these links without a dependency.

Two details worth keeping:

- Decoding rejects rather than returning empty. A link whose payload is corrupt reports that in the interface, because silently presenting an empty form looks like a tool that ran and found nothing.
- Decoded payloads are capped at `MAX_DECODED_BYTES`, so a hostile link can't hand the parser an unbounded string.

Typing doesn't rewrite the URL. Links are produced only by the **Copy link** control, which keeps history clean and avoids recompressing on every keystroke.

## Limitations

- Blocks in different hunks of the same file appear as top-level siblings, because the paste doesn't say how they're really related. Paste the whole pattern into the before-and-after tab when that relationship matters.
- A context line whose content starts with `-` or `+` is read as a change. Pattern markup rarely does this, but body text can. Use the before-and-after input tab when it happens.
- Balancing infers nesting that isn't in the paste. The affected blocks are marked, but the inference can still be wrong if the hunk is unusually fragmentary.
- The match threshold is a fixed `0.5`. A block rewritten past that point is reported as an addition and a removal rather than as a change.
- Attribute moves need an ancestor or descendant relationship, so a property that moves between sibling blocks isn't reported as a move.
- A shared link carries the diff itself, so a very large paste makes a very long URL. Typical pattern changes stay well under a kilobyte or two, but a whole-theme diff may not be practical to link.
- Matching is greedy rather than an optimal assignment. Given several near-equal candidates, it takes the first best score.

## Testing

Every stage has unit tests next to it, and `src/render/views.test.ts` asserts against rendered DOM under jsdom. The fixture in `src/lib/example.ts` is a real hunk that exercises re-parenting, a retargeted attribute, an unbalanced side, and an untouched child. Use it when changing the matcher.

Run `npm test` for the suite and `npm run build` to type check and build.
