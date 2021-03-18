import chunk from 'lodash/chunk';

import threader from './core/threader';
import { getMatchingFilesInBatches } from './core/scanner';
import { getOptions } from './core/options';

const commandOptions = getOptions();

// The batch size is determined by the number of hashes per thread
// and the threading concurrency
const batchSize =
	commandOptions.hashingBatchSize * commandOptions.threadingConcurrency;

// this needs to be called at module scope
await threader(
	__filename,
	async function pipeToThreads(sendToThread) {
		let ongoingTasks = [];

		// start scanning specified directory
		await getMatchingFilesInBatches(
			commandOptions.sourceDirectory,
			/\.(jpg|jpeg|png)$/i,
			// number of files to scan at a time
			batchSize,
			async (bulkImageBatch) => {
				for (const imageBatch of chunk(
					bulkImageBatch,
					commandOptions.hashingBatchSize
				)) {
					ongoingTasks.push(sendToThread(imageBatch));
				}

				// do ongoing tasks
				await Promise.all(ongoingTasks);
				ongoingTasks = [];
			}
		);

		console.log('complete');
	},
	async function setupImageProcessing() {
		console.log('loading thread utilities');
		const [sharp, imageHash, leven] = await Promise.all([
			import('sharp'),
			import('imghash'),
			import('leven'),
		]);

		// Return async callback
		async function processImage(imagePath) {
			const hash = await imageHash.hash(imagePath, 16);
			console.log(hash);
		}

		return async function processImageBatch({ data: imageBatch }) {
			return Promise.all(imageBatch.map(processImage));
		};
	}
);
