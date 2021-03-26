import fs from 'fs/promises';
import path from 'path';

import chunk from 'lodash/chunk';

import threader, {
	isMainThread,
	SendToThreadCallback,
	WorkerTaskResultPayload,
} from './core/threader';

import { getMatchingFilesInBatches } from './core/scanner';

import {
	getOptions,
	defaultByType,
	genericCommandOptions,
} from './core/options';

import { imageGroup, templateBottom, templateTop } from './core/basicHtml';

import { syncModels, connectAndBuildModels } from './imageHashModels';

interface imageHashTypeOptions extends genericCommandOptions {
	hashingBatchSize: number;
	comparisonBatchSize: number;
	sourceDirectory: string;
	minimumByteSize: number;
	levenDetailLevel: number;
	levenThreshold: number;
	levenResolution: number;
}

const commandOptions = <imageHashTypeOptions>getOptions();

/**
 * Flattens a batch of task and returns valid results as a single array
 * @param taskResults
 */
function flattenValidResults(
	taskResults: WorkerTaskResultPayload[]
): any[] & Pick<WorkerTaskResultPayload, 'result'>[] {
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

		// get image hash and return result
		const hash = await imageHash.hash(imagePath, levenDetailLevel);
		return { path: imagePath, hash, bytes: stats.size };
	}

	// Return handler function for messages from main process
	return async ({ data: imageBatch }) =>
		Promise.all(imageBatch.map(processImage));
}

interface levenCalculationIndividualResult {
	id: number;
	leven: number;
}

type levenCalculationResults = levenCalculationIndividualResult[];

interface LevenCalculationWorkerPayload
	extends Omit<WorkerTaskResultPayload, 'result'> {
	result: levenCalculationResults;
}

async function setupGroupingSender(log) {
	const batchSize =
		commandOptions.comparisonBatchSize *
		commandOptions.threadingConcurrency;

	const { sequelize, Image, Group } = await connectAndBuildModels();

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

	/**
	 * If matches are present, creates a new Group containing the primary image
	 * @param primaryImage
	 * @param allMatches
	 */
	async function assignMatchesToGroup(
		primaryImage,
		allMatches: levenCalculationResults
	) {
		if (!allMatches.length) return;

		// first build new group
		const newGroup = await Group.create();

		// build set of ids for bulk update
		const matchesByImageId = [
			// primary image
			primaryImage.get('id'),
			// any matches
			...allMatches.map((match) => match.id),
		];

		log('grouping', allMatches.length, 'images');

		// add matching images to group
		await sequelize.query(
			`
				UPDATE images
				set "groupId" = ?
				where id in (?)
				and "groupId" is null
			`,
			{
				replacements: [newGroup.get('id'), matchesByImageId],
			}
		);
	}

	return async function pipeToThreads(sendToThread) {
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
					assignMatchesToGroup(primaryImage, taskResults[index])
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
	): Promise<levenCalculationResults> {
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
		return results as levenCalculationResults;
	}

	async function processImage(rawImageModel) {
		const results = await performLevenshteinComparisons(rawImageModel.hash);
		// Only return matches that are less than or equal to the leven threshold
		return results.filter((result) => result.leven <= levenThreshold);
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

if (isMainThread) {
	const { Group } = await connectAndBuildModels();

	const groupedResults = await Group.findAll({
		include: [Group.associations.images],
		order: [['id', 'ASC']],
	});

	const file = 'sandbox/index.html';

	await fs.appendFile(file, templateTop('Image results'));

	let imageItems;

	for (const group of groupedResults) {
		imageItems = group.images
			.sort((a, b) => b.bytes - a.bytes)
			.map((image) => ({
				...image.get(),
				path: path.relative('sandbox', image.path),
			}));

		await fs.appendFile(file, imageGroup(group.id, imageItems));
	}

	await fs.appendFile(file, templateBottom());
}
