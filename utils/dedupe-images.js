import path from 'path';
import { setOptions } from '../lib/core/options';

setOptions({
	sourceDirectory: path.resolve(__dirname, '../sandbox/testdata'),
	// number of files to give to each thread at a time
	hashingBatchSize: 6, // 4,
	// number of threads to use
	threadingConcurrency: 6,
});

await import('../lib/imageHash');
