export declare function getMatchingFilesInBatches(rootDirectory: string, fileMatchRegexp: RegExp, maxBatchSize: number, asyncCallbackFcn: (pathBatch: string[]) => Promise<void>): Promise<void>;
