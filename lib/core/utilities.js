export function handleBatchWithRedundancy(batchData, handleBatch, log) {
    return Promise.all(batchData.map(async (item, index) => {
        try {
            return await handleBatch(item, index);
        }
        catch (error) {
            log(error);
            return { error };
        }
    }));
}
