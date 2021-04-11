# thread-utils

Multi-threaded batch processing on files. Self requiring.

> Requires postgresql and nodejs 14+

## Before using

```bash
npm install
npm run build
mkdir sandbox
```

## Image hash

Find and group duplicates of images using image hashing and Levenshtein comparisons.

`node -r esm dedupe [sourecDirectory] --mode lazy|top`

> Add `alias nde="node -r esm" for easier usage`

### `mode: 'lazy'`

- Fastest, fewest cycles. Groups together within threshold level
- Does not recurse over already paired images
- Leads to the most orphaned images

### `mode: 'top'`

- Uses the highest leven level (per image) when determining where to group
- No orphans as images are forced into groups