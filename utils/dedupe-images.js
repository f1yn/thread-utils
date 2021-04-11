import path from 'path';

import { setOptions } from '../lib/core/options';

const [_command, relativeSourceDirectory] = commandOptions._;

setOptions({
	// mode to execute in
	mode: commandOptions.mode || 'lazy',
	// directory to walk
	sourceDirectory: path.resolve(process.cwd(), relativeSourceDirectory),
	// number of files to give to each thread at a time
	hashingBatchSize: 6,
	// number of comparisons per thread at a time
	comparisonBatchSize: 1,
	// the minimum size in bytes
	minimumByteSize: 1, // 11 * 1024,
	// the resolution to generate the image hash
	levenDetailLevel: 24,
	// leven threshold (direct)
	levenThreshold: 22,
	// the maximum number of items per leven calculation
	levenResolution: 1024,
});

await import('../lib/imageHash').catch(
	(error) => console.error() || process.exit(error.code || 128)
);
