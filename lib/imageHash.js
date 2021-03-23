import fs from 'fs/promises';
import chunk from 'lodash/chunk';
import threader from './core/threader';
import { getMatchingFilesInBatches } from './core/scanner';
import { getOptions } from './core/options';
import { syncModels, connectAndBuildModels } from './imageHashModels';
const commandOptions = getOptions();
async function setupImageHashSender(log) {
    const batchSize = commandOptions.hashingBatchSize * commandOptions.threadingConcurrency;
    const { Image } = await syncModels();
    return async (sendToThread) => {
        let taskResults = [];
        let rawImageData = [];
        await getMatchingFilesInBatches(commandOptions.sourceDirectory, /\.(jpg|jpeg|png)$/i, batchSize, async (bulkImageBatch) => {
            taskResults = await Promise.all(chunk(bulkImageBatch, commandOptions.hashingBatchSize).map(sendToThread));
            rawImageData = []
                .concat(...taskResults.map((taskResult) => taskResult.result))
                .filter(Boolean);
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
    const { sequelize, Image, Group } = await connectAndBuildModels();
    let taskResults = [];
    return async function pipeToThreads(sendToThread) {
        const imagesToCompare = await Image.findAll({
            where: {
                processed: false,
                GroupId: null,
            },
            limit: batchSize,
        });
        await Promise.all(imagesToCompare.map((imageModel) => imageModel.update({ processed: true })));
        taskResults = await Promise.all(chunk(imagesToCompare, commandOptions.comparisonBatchSize).map((imageModelBatch) => sendToThread(imageModelBatch.map((model) => model.toJSON()))));
    };
}
async function setupGroupingReceiver(log) {
    const { sequelize, Image, Group } = await connectAndBuildModels();
    async function processImage(rawImageModel) {
        const result = await sequelize.query(`
				create extension if not exists fuzzystrmatch;
				select id, levenshtein(hash, ?) as leven_hash from images
				where images."GroupId" is null
				order by leven_hash ASC
			`, { replacements: [rawImageModel.hash] });
        console.log(result);
    }
    return async ({ data: imageBatch }) => Promise.all(imageBatch.map(processImage));
}
await threader('imagehash-bulk', __filename, setupImageHashSender, setupImageHashReceiver);
await threader('image-comparator', __filename, setupGroupingSender, setupGroupingReceiver);
