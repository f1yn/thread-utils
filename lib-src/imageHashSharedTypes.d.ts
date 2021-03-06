import { genericCommandOptions } from './core/options';
import { WorkerTaskResultPayload } from './core/threader';

export interface imageHashTypeOptions extends genericCommandOptions {
	mode: 'lazy' | 'top' | 'dry' | 'output';
	hashingBatchSize: number;
	comparisonBatchSize: number;
	sourceDirectory: string;
	minimumByteSize: number;
	levenDetailLevel: number;
	levenThreshold: number;
	levenResolution: number;
	groupOnly?: boolean;
	outputMode: 'copy' | 'move' | 'page';
	outputCopyBatchSize?: number;
}

export interface levenCalculationIndividualResult {
	id: number;
	groupId?: number | null;
	leven: number;
}

export type levenCalculationResults = levenCalculationIndividualResult[];

export interface LevenCalculationWorkerPayload
	extends Omit<WorkerTaskResultPayload, 'result'> {
	result: levenCalculationResults;
}
