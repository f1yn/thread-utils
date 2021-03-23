import 'dotenv/config';
export interface genericAnyCommandOptions {
    threadingConcurrency?: number;
    [key: string]: any;
}
export declare function setOptions(commandOptions: genericAnyCommandOptions): void;
export declare function getOptions(): genericAnyCommandOptions | null;
