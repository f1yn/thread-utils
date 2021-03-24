import 'dotenv/config';
export interface genericCommandOptions {
    threadingConcurrency?: number;
}
export declare function setOptions<T extends genericCommandOptions>(commandOptions: T): void;
export declare const defaultByType: <T>(source: T, typeString: string, defaultValue: T) => T;
export declare function getOptions<T extends genericCommandOptions>(): T | null;
