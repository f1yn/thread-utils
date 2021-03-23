import path from 'path';
import { setOptions } from '../lib/core/options';

setOptions({
	sourceDirectory: path.resolve(__dirname, '../sandbox/testdata'),
	// number of files to give to each thread at a time
	hashingBatchSize: 6, // 4,
	// number of comparisons per thread at a time
	comparisonBatchSize: 1,
	// the minimum size in bytes
	minimumByteSize: 11 * 1024,
	// leven thrashold
	levenThreshold: 12,
});

await import('../lib/imageHash');
