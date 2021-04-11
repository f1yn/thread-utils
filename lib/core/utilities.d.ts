interface BatchError {
    error: Error;
}
export declare function handleBatchWithRedundancy<MapInputType, MapReturnType>(batchData: MapInputType[], handleBatch: (item: MapInputType, index?: number) => Promise<MapReturnType>, log: any): Promise<Array<MapReturnType | BatchError>>;
export {};
