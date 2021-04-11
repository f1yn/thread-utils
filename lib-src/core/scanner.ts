import fs from 'fs';
import path from 'path';

// sourced from https://gist.github.com/lovasoa/8691344
async function* walk(dir: string) {
	for await (const d of await fs.promises.opendir(dir)) {
		const entry = path.join(dir, d.name);
		if (d.isDirectory()) yield* walk(entry);
		else if (d.isFile()) yield entry;
	}
}

/**
 * Walks a directory tree, and accumulates file paths that satisfy fileMatchRegexp.
 *   When the accumulated file paths reaches, maxBatchSize - callback will be called.
 * @param rootDirectory The directory to start walking from
 * @param fileMatchRegexp The regular expression used to filter
 * @param maxBatchSize The max number of fields before invoking the callback
 * @param asyncCallbackFcn The async callback
 */
export async function getMatchingFilesInBatches(
	rootDirectory: string,
	fileMatchRegexp: RegExp,
	maxBatchSize: number,
	asyncCallbackFcn: (pathBatch: string[]) => Promise<void>
) {
	let currentMatchingBatch = [];
	let pathToTest;

	// start at root
	for await (pathToTest of walk(rootDirectory)) {
		if (fileMatchRegexp.test(pathToTest)) {
			currentMatchingBatch.push(pathToTest);
			console.log('[scan] matching', pathToTest);
		} else {
			console.log('[scan] non matching', pathToTest);
		}

		// if we've reached the max batch size then push to the callback function
		if (currentMatchingBatch.length === maxBatchSize) {
			await asyncCallbackFcn(currentMatchingBatch);
			currentMatchingBatch = [];
		}
	}

	if (currentMatchingBatch.length) {
		await asyncCallbackFcn(currentMatchingBatch);
	}
}
