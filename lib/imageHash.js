import fs from 'fs/promises';
import chunk from 'lodash/chunk';
import threader from './core/threader';
import { getMatchingFilesInBatches } from './core/scanner';
import { getOptions, defaultByType, } from './core/options';
import { syncModels, connectAndBuildModels } from './imageHashModels';
const commandOptions = getOptions();
function flattenValidResults(taskResults) {
    return ([]
        .concat(...taskResults.map((taskResult) => taskResult.result))
        .filter(Boolean));
}
async function setupImageHashSender(log) {
    const batchSize = commandOptions.hashingBatchSize * commandOptions.threadingConcurrency;
    const { Image } = await syncModels();
    return async (sendToThread) => {
        let taskResults = [];
        let rawImageData = [];
        await getMatchingFilesInBatches(commandOptions.sourceDirectory, /\.(jpg|jpeg|png)$/i, batchSize, async (bulkImageBatch) => {
            taskResults = await Promise.all(chunk(bulkImageBatch, commandOptions.hashingBatchSize).map(sendToThread));
            rawImageData = flattenValidResults(taskResults);
            await Image.bulkCreate(rawImageData);
            taskResults = [];
            rawImageData = [];
        });
    };
}
async function setupImageHashReceiver(log) {
    const [imageHash] = await Promise.all([
        import('imghash'),
    ]);
    async function processImage(imagePath) {
        const stats = await fs.stat(imagePath);
        if (stats.size < commandOptions.minimumByteSize) {
            log('NOTICE: dropping', imagePath, 'as it does not meet minimum size', `(${stats.size} < ${commandOptions.minimumByteSize}\)`);
            return null;
        }
        const hash = await imageHash.hash(imagePath, 16);
        return { path: imagePath, hash, bytes: stats.size };
    }
    return async ({ data: imageBatch }) => Promise.all(imageBatch.map(processImage));
}
async function setupGroupingSender() {
    const batchSize = commandOptions.comparisonBatchSize *
        commandOptions.threadingConcurrency;
    const { Image, Group } = await connectAndBuildModels();
    let taskResults = [];
    return async function pipeToThreads(sendToThread) {
        const imagesToCompare = await Image.findAll({
            where: {
                processed: false,
                groupId: null,
            },
            limit: batchSize,
        });
        await Promise.all(imagesToCompare.map((imageModel) => imageModel.update({ processed: true })));
        taskResults = flattenValidResults(await Promise.all(chunk(imagesToCompare, commandOptions.comparisonBatchSize).map((imageModelBatch) => sendToThread(imageModelBatch.map((model) => model.toJSON())))));
        console.log(taskResults);
    };
}
async function setupGroupingReceiver(log) {
    const { sequelize } = await connectAndBuildModels();
    const levenThreshold = defaultByType(commandOptions.levenThreshold, 'number', 12);
    const levenResolution = defaultByType(commandOptions.levenResolution, 'number', 1024);
    async function performLevenshteinComparisons(hash) {
        const [results] = await sequelize.query(`
				create extension if not exists fuzzystrmatch;
				select id, levenshtein(hash, ?) as leven from images
				where "groupId" is null and
				processed = false
				order by leven ASC
				limit ?
			`, { replacements: [hash, levenResolution] });
        return results;
    }
    async function processImage(rawImageModel) {
        const results = await performLevenshteinComparisons(rawImageModel.hash);
        return results.filter((result) => result.leven >= levenThreshold);
    }
    return async ({ data: imageBatch }) => Promise.all(imageBatch.map(processImage));
}
await threader('imagehash-bulk', __filename, setupImageHashSender, setupImageHashReceiver);
await threader('image-comparator', __filename, setupGroupingSender, setupGroupingReceiver);
