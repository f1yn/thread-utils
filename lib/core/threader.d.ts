import { isMainThread } from 'worker_threads';
export interface WorkerTaskResultPayload {
    threadId: number;
    taskId: string;
    result: any;
}
export declare type SendToThreadCallback = (data: any) => Promise<WorkerTaskResultPayload>;
declare function threaderMainHandler(actionId: any, script: any, mainContextCallback: any, _workerContextCallback: any): Promise<void>;
declare const _default: typeof threaderMainHandler;
export default _default;
export { isMainThread };
