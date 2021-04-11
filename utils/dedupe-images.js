import path from 'path';
import { setOptions } from '../lib/core/options';

setOptions({
	// mode to execute in
	mode: 'top',
	// directory to walk
	sourceDirectory: path.resolve(__dirname, '../sandbox'),
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

await import('../lib/imageHash');
