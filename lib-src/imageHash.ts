import fs from 'fs/promises';
import chunk from 'lodash/chunk';

import threader, {
	SendToThreadCallback,
	WorkerTaskResultPayload,
} from './core/threader';

import { getMatchingFilesInBatches } from './core/scanner';
import { getOptions } from './core/options';
import { syncModels, connectAndBuildModels } from './imageHashModels';

const commandOptions = getOptions();

async function setupImageHashSender(log) {
	// The batch size is determined by the number of hashes per thread
	// and the threading concurrency
	const batchSize =
		commandOptions.hashingBatchSize * commandOptions.threadingConcurrency;

	// setup model definitions
	const { Image } = await syncModels();

	// return helper function
	return async (sendToThread: SendToThreadCallback) => {
		let taskResults: WorkerTaskResultPayload[] = [];
		let rawImageData = [];

		// start scanning specified directory
		await getMatchingFilesInBatches(
			commandOptions.sourceDirectory,
			/\.(jpg|jpeg|png)$/i,
			batchSize,
			async (bulkImageBatch) => {
				// perform image batching - break into groups and send to individual threads
				// wait for all threads to complete their batches before processing on the
				// main thread (shotgun approach)
				taskResults = await Promise.all(
					chunk(bulkImageBatch, commandOptions.hashingBatchSize).map(
						sendToThread
					)
				);

				// flatten and filter
				rawImageData = []
					.concat(
						...taskResults.map((taskResult) => taskResult.result)
					)
					// Only use results that were processed
					.filter(Boolean);

				// write results to database in bulk
				await Image.bulkCreate(rawImageData);

				// nudge GC
				taskResults = [];
				rawImageData = [];
			}
		);
	};
}

async function setupImageHashReceiver(log) {
	const [imageHash] = await Promise.all([
		// import('sharp'),
		import('imghash'),
	]);

	// Return async callback
	async function processImage(imagePath) {
		// first get fs meta to verify size
		const stats = await fs.stat(imagePath);

		if (stats.size < commandOptions.minimumByteSize) {
			log(
				'NOTICE: dropping',
				imagePath,
				'as it does not meet minimum size',
				`(${stats.size} < ${commandOptions.minimumByteSize}\)`
			);

			// Return null to flag as unusable
			return null;
		}

		// get image hash and return result
		const hash = await imageHash.hash(imagePath, 16);
		return { path: imagePath, hash, bytes: stats.size };
	}

	// Return handler function for messages from main process
	return async ({ data: imageBatch }) =>
		Promise.all(imageBatch.map(processImage));
}

async function setupGroupingSender() {
	const batchSize =
		commandOptions.comparisonBatchSize *
		commandOptions.threadingConcurrency;

	const { sequelize, Image, Group } = await connectAndBuildModels();

	let taskResults = [];

	return async function pipeToThreads(sendToThread) {
		// load in a single bulk batch of images (not already selected,
		// and not in any known group)
		const imagesToCompare = await Image.findAll({
			where: {
				processed: false,
				GroupId: null,
			},
			limit: batchSize,
		});

		// set images as processed to avoid reselection in next batch
		await Promise.all(
			imagesToCompare.map((imageModel) =>
				imageModel.update({ processed: true })
			)
		);

		// send image model values to thread
		taskResults = await Promise.all(
			chunk(
				imagesToCompare,
				commandOptions.comparisonBatchSize
			).map((imageModelBatch) =>
				sendToThread(imageModelBatch.map((model) => model.toJSON()))
			)
		);
	};
}

async function setupGroupingReceiver(log) {
	const { sequelize, Image, Group } = await connectAndBuildModels();

	async function processImage(rawImageModel) {
		const result = await sequelize.query(
			`
				create extension if not exists fuzzystrmatch;
				select id, levenshtein(hash, ?) as leven_hash from images
				where images."GroupId" is null
				order by leven_hash ASC
			`,
			{ replacements: [rawImageModel.hash] }
		);

		console.log(result);
	}

	return async ({ data: imageBatch }) =>
		Promise.all(imageBatch.map(processImage));
}

await threader(
	'imagehash-bulk',
	__filename,
	setupImageHashSender,
	setupImageHashReceiver
);

await threader(
	'image-comparator',
	__filename,
	setupGroupingSender,
	setupGroupingReceiver
);
