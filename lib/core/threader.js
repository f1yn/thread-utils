import debug from './log';
import { isMainThread, parentPort, Worker, workerData } from 'worker_threads';
import { v4 as uuid } from 'uuid';
import { getOptions } from './options';
const threaderLog = debug('threader');
const WORKER_READY_MESSAGE = 'READY!!';
async function threaderMainHandler(actionId, script, mainContextCallback, _workerContextCallback) {
    threaderLog('registered threader action', actionId);
    const actionLog = debug('threader', actionId);
    const commandOptions = getOptions();
    const mainHandlerCallback = await mainContextCallback(actionLog, commandOptions);
    const allWorkersCircular = [];
    let count = commandOptions.threadingConcurrency;
    actionLog('started setting up threads required for processing');
    while (count--) {
        const threadId = commandOptions.threadingConcurrency - count;
        const workerNode = {
            id: threadId,
            worker: new Worker(script, {
                workerData: {
                    ...commandOptions,
                    actionId,
                    threadId,
                },
            }),
            next: false,
        };
        workerNode.worker.on('error', (error) => console.error(error));
        workerNode.readyPromise = new Promise((resolve, reject) => {
            workerNode.worker.once('message', (payload) => payload === WORKER_READY_MESSAGE && resolve(true));
            workerNode.worker.once('error', reject);
        });
        allWorkersCircular.push(workerNode);
    }
    allWorkersCircular.forEach((workerNodeRef, index) => {
        const nextIndex = index === allWorkersCircular.length - 1 ? 0 : index + 1;
        workerNodeRef.next = allWorkersCircular[nextIndex];
    });
    actionLog('wait for worker initialization');
    await Promise.all(allWorkersCircular.map((workerNodeRef) => workerNodeRef.readyPromise));
    actionLog('all workers ready!');
    let workerIterator = allWorkersCircular[allWorkersCircular.length - 1];
    function sentToThreadAndWait(data) {
        workerIterator = workerIterator.next;
        const currentSelectedThread = workerIterator;
        const taskId = uuid();
        const pendingTaskPromise = new Promise((resolve) => {
            function waitForTaskCompletion(result) {
                if (result.taskId !== taskId)
                    return;
                actionLog('task', taskId, 'completed');
                currentSelectedThread.worker.removeListener('message', waitForTaskCompletion);
                resolve(result);
            }
            actionLog('task', taskId, 'sent to thread', workerIterator.id);
            currentSelectedThread.worker.addListener('message', waitForTaskCompletion);
        });
        currentSelectedThread.worker.postMessage({
            taskId,
            threadId: currentSelectedThread.id,
            data,
        });
        return pendingTaskPromise;
    }
    await mainHandlerCallback(sentToThreadAndWait);
    actionLog('main context has exited. closing threads');
    allWorkersCircular.map((workerNodeRef) => workerNodeRef.worker.terminate());
    actionLog('all threads closed');
}
async function threaderWorkerHandler(actionId, _script, _mainContextCallback, workerContextCallback) {
    const actionLog = debug('threader', actionId);
    if (workerData.actionId !== actionId) {
        actionLog('skipping', actionId, 'waiting for action', workerData.actionId);
        return;
    }
    const commandOptions = getOptions();
    const workerHandlerCallback = await workerContextCallback(actionLog, commandOptions);
    parentPort.on('message', async (payload) => {
        const result = await workerHandlerCallback(payload);
        parentPort.postMessage({
            threadId: payload.threadId,
            taskId: payload.taskId,
            result,
        });
    });
    parentPort.postMessage(WORKER_READY_MESSAGE);
}
export default isMainThread ? threaderMainHandler : threaderWorkerHandler;
export { isMainThread };
