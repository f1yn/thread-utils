import fs from 'fs/promises';
import path from 'path';
import chunk from 'lodash/chunk';
import threader, { isMainThread, } from './core/threader';
import { getMatchingFilesInBatches } from './core/scanner';
import { defaultByType, getOptions } from './core/options';
import { handleBatchWithRedundancy } from './core/utilities';
import { imageGroup, templateBottom, templateTop } from './core/basicHtml';
import { connectAndBuildModels, syncModels } from './imageHashModels';
import { assignMatchesToGroup, performLevenshteinComparisons, } from './imageHashAlgo';
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
    const levenDetailLevel = defaultByType(commandOptions.levenDetailLevel, 'number', 16);
    async function processImage(imagePath) {
        const stats = await fs.stat(imagePath);
        if (stats.size < commandOptions.minimumByteSize) {
            log('NOTICE: dropping', imagePath, 'as it does not meet minimum size', `(${stats.size} < ${commandOptions.minimumByteSize}\)`);
            return null;
        }
        const hash = await imageHash.hash(imagePath, levenDetailLevel);
        return { path: imagePath, hash, bytes: stats.size };
    }
    return ({ data: imageBatch }) => handleBatchWithRedundancy(imageBatch, processImage, log);
}
async function setupGroupingSender(log) {
    const batchSize = commandOptions.comparisonBatchSize *
        commandOptions.threadingConcurrency;
    const models = await connectAndBuildModels();
    const { Image } = models;
    const getCurrentImageBatch = () => Image.findAll({
        where: {
            processed: false,
            groupId: null,
        },
        limit: batchSize,
    });
    return async function pipeToThreads(sendToThread) {
        let taskResults = [];
        let imagesToCompare = await getCurrentImageBatch();
        while (imagesToCompare.length) {
            await Promise.all(imagesToCompare.map((imageModel) => imageModel.update({ processed: true })));
            taskResults = flattenValidResults(await Promise.all(chunk(imagesToCompare, commandOptions.comparisonBatchSize).map((imageModelBatch) => sendToThread(imageModelBatch.map((model) => model.toJSON())))));
            await Promise.all(imagesToCompare.map((primaryImage, index) => assignMatchesToGroup(models, log, primaryImage, taskResults[index])));
            let index = imagesToCompare.length;
            let currentImage;
            while (index--) {
                currentImage = imagesToCompare[index];
                taskResults[index];
            }
            imagesToCompare = await getCurrentImageBatch();
            taskResults = [];
        }
    };
}
async function setupGroupingReceiver(log) {
    const models = await connectAndBuildModels();
    async function processImage(rawImageModel) {
        return await performLevenshteinComparisons(models, log, rawImageModel.hash);
    }
    return async ({ data: imageBatch }) => handleBatchWithRedundancy(imageBatch, processImage, log);
}
await threader('imagehash-bulk', __filename, setupImageHashSender, setupImageHashReceiver);
await threader('image-comparator', __filename, setupGroupingSender, setupGroupingReceiver);
if (isMainThread) {
    const { Group } = await connectAndBuildModels();
    const groupedResults = await Group.findAll({
        include: [Group.associations.images],
        order: [['id', 'ASC']],
    });
    const file = path.join('./sandbox', '/index.html');
    await fs.appendFile(file, templateTop('Image results'));
    let imageItems;
    for (const group of groupedResults) {
        imageItems = group.images
            .sort((a, b) => b.bytes - a.bytes)
            .map((image) => ({
            ...image.get(),
            path: `http://localhost:5000/${path.relative(commandOptions.sourceDirectory, image.path)}`,
        }));
        await fs.appendFile(file, imageGroup(group.id, imageItems));
    }
    await fs.appendFile(file, templateBottom());
}
