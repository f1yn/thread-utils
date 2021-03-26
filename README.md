# thread-utils

Multi-threaded batch processing on files. Self requiring.

> Requires postgresql and nodejs 14+

## Image hash

### `mode: 'lazy'`

- Fastest, fewest cycles. Groups together within threshold level
- Does not recurse over already paired images
- Leads to the most orphaned images

### `mode: 'top'`

- Uses the highest leven level (per image) when determining where to group
- No orphans as images are forced into groups