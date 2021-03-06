import fs from 'fs/promises';
import chunk from 'lodash/chunk';

import threader, {
	isMainThread,
	SendToThreadCallback,
	WorkerTaskResultPayload,
} from './core/threader';

import { getMatchingFilesInBatches } from './core/scanner';
import { defaultByType, getOptions } from './core/options';
import {
	flattenValidResults,
	handleBatchWithRedundancy,
} from './core/utilities';

import { connectAndBuildModels, syncModels } from './imageHashModels';

import {
	assignMatchesToGroup,
	performLevenshteinComparisons,
} from './imageHashAlgo';

import {
	imageHashTypeOptions,
	levenCalculationResults,
	LevenCalculationWorkerPayload,
} from './imageHashSharedTypes';

import {
	outputFilesystem,
	outputDryRunStats,
	outputToHtml,
} from './imageHashOutput';

const commandOptions = <imageHashTypeOptions>getOptions();

try {
	// Attempt to access sourceDirectory
	await fs.access(commandOptions.sourceDirectory);
} catch (error) {
	console.error(
		`Could not load the provided sourceDirectory ${commandOptions.sourceDirectory}"`
	);
	throw error;
}

// flag that indeicates if we are running in dry (count) mode
const isDryMode = commandOptions.mode === 'dry';

async function setupImageHashSender(log) {
	// If groupOnly, skip calculating hashes
	if (commandOptions.groupOnly || commandOptions.mode === 'output') return;

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
			},
			// show non-matching in dry mode for debugging
			isDryMode
		);
	};
}

async function setupImageHashReceiver(log) {
	const [imageHash] = await Promise.all([
		// import('sharp'),
		import('imghash'),
	]);

	const levenDetailLevel = defaultByType(
		commandOptions.levenDetailLevel,
		'number',
		16
	);

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

		// In dry mode, we're just looking for a count estimate
		if (isDryMode) {
			return { path: imagePath, hash: '', bytes: stats.size };
		}

		// get image hash and return result
		const hash = await imageHash.hash(imagePath, levenDetailLevel);
		return { path: imagePath, hash, bytes: stats.size };
	}

	// Return handler function for messages from main process
	return ({ data: imageBatch }) =>
		handleBatchWithRedundancy(imageBatch, processImage, log);
}

async function setupGroupingSender(log) {
	const batchSize =
		commandOptions.comparisonBatchSize *
		commandOptions.threadingConcurrency;

	// If we're in render mode, dont render
	if (commandOptions.mode === 'output') return;

	const models = await connectAndBuildModels();

	if (commandOptions.groupOnly) {
		// remove group associations and processed flags
		await models.sequelize.query(`
			UPDATE images
			set "groupId" = null,
			processed = false
		`);

		// drop all groups
		await models.sequelize.query(`
			DELETE from groups
		`);
	}

	const { Image } = models;

	/**
	 * Resolves with a batch of images
	 */
	const getCurrentImageBatch = () =>
		Image.findAll({
			where: {
				processed: false,
				groupId: null,
			},
			limit: batchSize,
		});

	return async function pipeToThreads(sendToThread) {
		// Don't do anything in dry mode
		if (isDryMode) return;

		// store results in the same memory alloc
		let taskResults: levenCalculationResults[] &
			Pick<LevenCalculationWorkerPayload, 'result'>[] = [];

		// fetch the first batch of images
		let imagesToCompare = await getCurrentImageBatch();

		while (imagesToCompare.length) {
			// set images as processed to avoid reselection in next batch
			await Promise.all(
				imagesToCompare.map((imageModel) =>
					imageModel.update({ processed: true })
				)
			);

			// send image model values to thread and calucalat
			taskResults = flattenValidResults(
				await Promise.all(
					chunk(
						imagesToCompare,
						commandOptions.comparisonBatchSize
					).map((imageModelBatch) =>
						sendToThread(
							imageModelBatch.map((model) => model.toJSON())
						)
					)
				)
			);

			// Iterate over each image and image task result - and group non-grouped items
			await Promise.all(
				imagesToCompare.map((primaryImage, index) =>
					assignMatchesToGroup(
						models,
						log,
						primaryImage,
						taskResults[index]
					)
				)
			);

			let index = imagesToCompare.length;
			let currentImage;

			while (index--) {
				currentImage = imagesToCompare[index];
				taskResults[index];
			}

			// get next batch
			imagesToCompare = await getCurrentImageBatch();
			// nudge GC
			taskResults = [];
		}
	};
}

async function setupGroupingReceiver(log) {
	const models = await connectAndBuildModels();

	async function processImage(rawImageModel) {
		return await performLevenshteinComparisons(
			models,
			log,
			rawImageModel.hash
		);
	}

	return async ({ data: imageBatch }) =>
		handleBatchWithRedundancy(imageBatch, processImage, log);
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

if (isMainThread) {
	const models = await connectAndBuildModels();

	if (isDryMode) {
		await outputDryRunStats(models);
	} else if (commandOptions.outputMode === 'page') {
		await outputToHtml(models);
	} else if (commandOptions.outputMode === 'copy') {
		await outputFilesystem(models);
	} else if (commandOptions.outputMode === 'move') {
		await outputFilesystem(models, true);
	}
}
