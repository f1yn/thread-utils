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
		}

		if (currentMatchingBatch.length === maxBatchSize) {
			await asyncCallbackFcn(currentMatchingBatch);
			currentMatchingBatch = [];
		}
	}

	if (currentMatchingBatch.length) {
		await asyncCallbackFcn(currentMatchingBatch);
	}
}
