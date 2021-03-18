export interface genericAnyCommandOptions {
    taskConcurrency?: number;
    threadingConcurrency?: number;
    [key: string]: any;
}
export declare function setOptions(commandOptions: genericAnyCommandOptions): void;
export declare function getOptions(): genericAnyCommandOptions | null;
