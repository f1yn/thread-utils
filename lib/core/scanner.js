import fs from 'fs';
import path from 'path';
async function* walk(dir) {
    for await (const d of await fs.promises.opendir(dir)) {
        const entry = path.join(dir, d.name);
        if (d.isDirectory())
            yield* walk(entry);
        else if (d.isFile())
            yield entry;
    }
}
export async function getMatchingFilesInBatches(rootDirectory, fileMatchRegexp, maxBatchSize, asyncCallbackFcn) {
    let currentMatchingBatch = [];
    let pathToTest;
    for await (pathToTest of walk(rootDirectory)) {
        if (fileMatchRegexp.test(pathToTest)) {
            currentMatchingBatch.push(pathToTest);
            console.log('[scan] matching', pathToTest);
        }
        else {
            console.log('[scan] non matching', pathToTest);
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
