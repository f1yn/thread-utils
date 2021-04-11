import { WorkerTaskResultPayload } from './threader';

interface BatchError {
	error: Error;
}

/**
 * Promise.all wrapper, which will handle errors without compromising the rest
 *   of the batched items
 * @param batchData
 * @param handleBatch
 * @param log
 */
export function handleBatchWithRedundancy<MapInputType, MapReturnType>(
	batchData: MapInputType[],
	handleBatch: (item: MapInputType, index?: number) => Promise<MapReturnType>,
	log
): Promise<Array<MapReturnType | BatchError>> {
	return Promise.all(
		batchData.map(async (item, index) => {
			try {
				return await handleBatch(item, index);
			} catch (error) {
				log(error);
				return { error };
			}
		})
	);
}

/**
 * Flattens a batch of task and returns valid results as a single array
 * @param taskResults
 */
export function flattenValidResults(
	taskResults: WorkerTaskResultPayload[]
): any[] & Pick<WorkerTaskResultPayload, 'result'>[] {
	return (
		[]
			.concat(...taskResults.map((taskResult) => taskResult.result))
			// Only use results that were processed/did not encounter errors
			.filter((result) => Boolean(result) && !result.error)
	);
}
