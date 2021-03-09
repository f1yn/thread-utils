import fs from 'fs';
import path from 'path';

// sourced from https://gist.github.com/lovasoa/8691344
async function* walk(dir : string) {
	for await (const d of await fs.promises.opendir(dir)) {
		const entry = path.join(dir, d.name);
		if (d.isDirectory()) yield* walk(entry);
		else if (d.isFile()) yield entry;
	}
}

/**
 *
 * @param rootDirectory
 * @param extensionRegexp
 * @param asyncFcn
 */
export async function forEachIndividualFile(rootDirectory : string, extensionRegexp : RegExp, asyncFcn: (path: string) => Promise<void>) {
	let pathToTest;

	// start at root
	for await (pathToTest of walk(rootDirectory)) {
		if (extensionRegexp.test(pathToTest)) {
			await asyncFcn(pathToTest);
		}
	}
}
