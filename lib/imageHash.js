import chunk from 'lodash/chunk';
import threader from './core/threader';
import { getMatchingFilesInBatches } from './core/scanner';
import { getOptions } from './core/options';
const commandOptions = getOptions();
const batchSize = commandOptions.hashingBatchSize * commandOptions.threadingConcurrency;
await threader(__filename, async function pipeToThreads(sendToThread) {
    let ongoingTasks = [];
    await getMatchingFilesInBatches(commandOptions.sourceDirectory, /\.(jpg|jpeg|png)$/i, batchSize, async (bulkImageBatch) => {
        for (const imageBatch of chunk(bulkImageBatch, commandOptions.hashingBatchSize)) {
            ongoingTasks.push(sendToThread(imageBatch));
        }
        await Promise.all(ongoingTasks);
        ongoingTasks = [];
    });
    console.log('complete');
}, async function setupImageProcessing() {
    console.log('loading thread utilities');
    const [sharp, imageHash, leven] = await Promise.all([
        import('sharp'),
        import('imghash'),
        import('leven'),
    ]);
    async function processImage(imagePath) {
        const hash = await imageHash.hash(imagePath, 16);
        console.log(hash);
    }
    return async function processImageBatch({ data: imageBatch }) {
        return Promise.all(imageBatch.map(processImage));
    };
});
