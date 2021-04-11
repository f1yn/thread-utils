import 'dotenv/config';
export interface genericCommandOptions {
    threadingConcurrency?: number;
}
export declare function setOptions<T extends genericCommandOptions>(commandOptions: T): void;
export declare const defaultByType: <PrefType>(source: PrefType, typeString: string, defaultValue: PrefType) => PrefType;
export declare function getOptions<T extends genericCommandOptions>(): T | null;
