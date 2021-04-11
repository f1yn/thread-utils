import path from 'path';

import { setOptions, validateStrictConfigIsIn } from '../lib/core/options';

const relativeSourceDirectory = commandOptions._[1];

// perform validations
const mode = commandOptions.mode || 'lazy';
validateStrictConfigIsIn('mode', ['top', 'lazy', 'dry', 'output'], mode);

const outputMode = commandOptions.output;
validateStrictConfigIsIn('output', ['page', 'copy'], outputMode);

setOptions({
	// mode to execute in
	mode,
	// directory to walk
	sourceDirectory: path.resolve(process.cwd(), relativeSourceDirectory),
	// number of files to give to each thread at a time
	hashingBatchSize: commandOptions.hashBatchSize || 6,
	// number of comparisons per thread at a time
	comparisonBatchSize: 1,
	// the minimum size in bytes
	minimumByteSize: 11 * 1024,
	// the resolution to generate the image hash
	levenDetailLevel: commandOptions.detailLevel || 24,
	// leven threshold (direct)
	levenThreshold: 22,
	// the maximum number of items per leven calculation
	levenResolution: 1024,
	// avoid walking down certain directories
	dontWalk: /(AppData)|(Lightroom)|(\$RECYCLE\.BIN)/,
	// determine if we should only group
	groupOnly: commandOptions.groupOnly,
	// determine how we intend on rendering results
	outputMode,
});

await import('../lib/imageHash').catch(
	(error) => console.error() || process.exit(error.code || 128)
);
