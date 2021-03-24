import fs from 'fs/promises';

import chunk from 'lodash/chunk';

import threader, {
	SendToThreadCallback,
	WorkerTaskResultPayload,
} from './core/threader';

import { getMatchingFilesInBatches } from './core/scanner';

import {
	getOptions,
	defaultByType,
	genericCommandOptions,
} from './core/options';

import { syncModels, connectAndBuildModels } from './imageHashModels';

interface imageHashTypeOptions extends genericCommandOptions {
	hashingBatchSize: number;
	comparisonBatchSize: number;
	sourceDirectory: string;
	minimumByteSize: number;
	levenThreshold: number;
	levenResolution: number;
}

interface levenCalculationResult {
	id: number;
	leven: number;
}

const commandOptions = <imageHashTypeOptions>getOptions();

/**
 * Flattens a batch of task and returns valid results as a single array
 * @param taskResults
 */
function flattenValidResults(
	taskResults: WorkerTaskResultPayload[]
): Pick<WorkerTaskResultPayload, 'result'>[] {
	return (
		[]
			.concat(...taskResults.map((taskResult) => taskResult.result))
			// Only use results that were processed
			.filter(Boolean)
	);
}

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
				rawImageData = flattenValidResults(taskResults);

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

	const { Image, Group } = await connectAndBuildModels();

	let taskResults = [];

	return async function pipeToThreads(sendToThread) {
		// load in a single bulk batch of images (not already selected,
		// and not in any known group)
		const imagesToCompare = await Image.findAll({
			where: {
				processed: false,
				groupId: null,
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
		taskResults = flattenValidResults(
			await Promise.all(
				chunk(
					imagesToCompare,
					commandOptions.comparisonBatchSize
				).map((imageModelBatch) =>
					sendToThread(imageModelBatch.map((model) => model.toJSON()))
				)
			)
		);

		console.log(taskResults);
	};
}

async function setupGroupingReceiver(log) {
	const { sequelize } = await connectAndBuildModels();

	const levenThreshold = defaultByType(
		commandOptions.levenThreshold,
		'number',
		12
	);

	const levenResolution = defaultByType(
		commandOptions.levenResolution,
		'number',
		1024
	);

	/**
	 * Calculates levenshtein distance between a single hash, in comparison to all
	 * other eligible images in the database
	 * @param hash
	 */
	async function performLevenshteinComparisons(
		hash: string
	): Promise<levenCalculationResult[]> {
		const [results] = await sequelize.query(
			`
				create extension if not exists fuzzystrmatch;
				select id, levenshtein(hash, ?) as leven from images
				where "groupId" is null and
				processed = false
				order by leven ASC
				limit ?
			`,
			{ replacements: [hash, levenResolution] }
		);
		return results as levenCalculationResult[];
	}

	async function processImage(rawImageModel) {
		const results = await performLevenshteinComparisons(rawImageModel.hash);
		// Only return matches that are less than or equal to the leven threshold
		return results.filter((result) => result.leven >= levenThreshold);
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
