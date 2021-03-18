import debug from './log';
import { isMainThread, parentPort, Worker } from 'worker_threads';
import { v4 as uuid } from 'uuid';
import { getOptions } from './options';
const log = debug('threader');
const WORKER_READY_MESSAGE = 'READY!!';
async function threaderMainHandler(script, mainContextCallback, _workerContextCallback) {
    const commandOptions = getOptions();
    const threadingConcurrency = commandOptions.threadingConcurrency || 6;
    const allWorkersCircular = [];
    let count = threadingConcurrency;
    log('started setting up threads required for processing');
    while (count--) {
        const threadId = threadingConcurrency - count;
        const workerNode = {
            id: threadId,
            worker: new Worker(script, {
                workerData: {
                    ...commandOptions,
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
    console.log('wait for worker inits');
    await Promise.all(allWorkersCircular.map((workerNodeRef) => workerNodeRef.readyPromise));
    console.log('all workers ready!');
    let workerIterator = allWorkersCircular[allWorkersCircular.length - 1];
    function sentToThreadAndWait(data) {
        workerIterator = workerIterator.next;
        const currentSelectedThread = workerIterator;
        const taskId = uuid();
        const pendingTaskPromise = new Promise((resolve) => {
            function waitForTaskCompletion(result) {
                if (result.taskId !== taskId)
                    return;
                log('task', taskId, 'completed');
                currentSelectedThread.worker.removeListener('message', waitForTaskCompletion);
                resolve(result);
            }
            log('task', taskId, 'sent');
            currentSelectedThread.worker.addListener('message', waitForTaskCompletion);
        });
        currentSelectedThread.worker.postMessage({
            taskId,
            threadId: currentSelectedThread.id,
            data,
        });
        return pendingTaskPromise;
    }
    mainContextCallback(sentToThreadAndWait);
}
async function threaderWorkerHandler(_script, _mainContextCallback, workerContextCallback) {
    const commandOptions = getOptions();
    const workerHandlerCallback = await workerContextCallback(commandOptions);
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
