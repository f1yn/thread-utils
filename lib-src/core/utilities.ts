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
