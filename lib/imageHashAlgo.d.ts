import { levenCalculationResults } from './imageHashSharedTypes';
declare function lazyPerformLevenshteinComparisons(models: any, log: any, hash: string): Promise<levenCalculationResults>;
declare function lazyAssignMatchesToGroup(models: any, log: any, primaryImage: any, allMatches: levenCalculationResults): Promise<void>;
export declare const performLevenshteinComparisons: typeof lazyPerformLevenshteinComparisons;
export declare const assignMatchesToGroup: typeof lazyAssignMatchesToGroup;
export {};
