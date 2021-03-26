import debug from './log';
import { isMainThread, parentPort, Worker, workerData } from 'worker_threads';
import { v4 as uuid } from 'uuid';

import { getOptions } from './options';

interface WorkerNode {
	id: number;
	next: WorkerNode | false;
	worker: Worker;
	readyPromise: Promise<boolean>;
}

interface WorkerTaskPayload {
	threadId: number;
	taskId: string;
	data: any;
}

export interface WorkerTaskResultPayload {
	threadId: number;
	taskId: string;
	result: any;
}

export type SendToThreadCallback = (
	data: any
) => Promise<WorkerTaskResultPayload>;

const threaderLog = debug('threader');

const WORKER_READY_MESSAGE = 'READY!!';

async function threaderMainHandler(
	actionId,
	script,
	mainContextCallback,
	_workerContextCallback
) {
	threaderLog('registered threader action', actionId);

	const actionLog = debug('threader', actionId);

	// get snapshot of command options
	const commandOptions = getOptions();

	// build closure for pre-worker init setup
	const mainHandlerCallback = await mainContextCallback(
		actionLog,
		commandOptions
	);

	// store workers in a circular linked array
	const allWorkersCircular = [];

	// setup all workers
	let count = commandOptions.threadingConcurrency;
	actionLog('started setting up threads required for processing');

	while (count--) {
		const threadId = commandOptions.threadingConcurrency - count;

		const workerNode: Partial<WorkerNode> = {
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

		// pipe errors to primary process
		workerNode.worker.on('error', (error) => console.error(error));

		// setup pending promise to check when all workers have initialized
		workerNode.readyPromise = new Promise((resolve, reject) => {
			workerNode.worker.once(
				'message',
				(payload) => payload === WORKER_READY_MESSAGE && resolve(true)
			);
			workerNode.worker.once('error', reject);
		});

		allWorkersCircular.push(workerNode as WorkerNode);
	}

	// setup workers as linked list
	allWorkersCircular.forEach((workerNodeRef, index) => {
		const nextIndex =
			index === allWorkersCircular.length - 1 ? 0 : index + 1;
		workerNodeRef.next = allWorkersCircular[nextIndex];
	});

	// wait for initialization of existing workers
	actionLog('wait for worker initialization');
	await Promise.all(
		allWorkersCircular.map((workerNodeRef) => workerNodeRef.readyPromise)
	);
	actionLog('all workers ready!');

	// set ref pointing to first thread
	let workerIterator = allWorkersCircular[allWorkersCircular.length - 1];

	function sentToThreadAndWait(data) {
		// iterate selected worker first
		workerIterator = workerIterator.next;
		const currentSelectedThread = workerIterator;
		const taskId = uuid();

		// create promise that resolves when the task resolves
		const pendingTaskPromise = new Promise((resolve) => {
			// TODO: add error interceptor
			function waitForTaskCompletion(result) {
				if (result.taskId !== taskId) return;
				// unbind listener for this task
				actionLog('task', taskId, 'completed');
				currentSelectedThread.worker.removeListener(
					'message',
					waitForTaskCompletion
				);
				resolve(result);
			}

			// attach listener
			actionLog('task', taskId, 'sent to thread', workerIterator.id);
			currentSelectedThread.worker.addListener(
				'message',
				waitForTaskCompletion
			);
		}) as Promise<WorkerTaskResultPayload>;

		// initiate the job
		currentSelectedThread.worker.postMessage({
			taskId,
			threadId: currentSelectedThread.id,
			data,
		});

		return pendingTaskPromise;
	}

	// run the main context callback
	await mainHandlerCallback(sentToThreadAndWait as SendToThreadCallback);

	actionLog('main context has exited. closing threads');
	// now that messaging queues have cleared, terminate all of the worker threads
	allWorkersCircular.map((workerNodeRef) => workerNodeRef.worker.terminate());
	actionLog('all threads closed');
}

async function threaderWorkerHandler(
	actionId,
	_script,
	_mainContextCallback,
	workerContextCallback
) {
	const actionLog = debug('threader', actionId);

	if (workerData.actionId !== actionId) {
		actionLog(
			'skipping',
			actionId,
			'waiting for action',
			workerData.actionId
		);
		// skip
		return;
	}

	// get command options from the worker arguments
	const commandOptions = getOptions();

	// generate closure needed for thread handling
	const workerHandlerCallback = await workerContextCallback(
		actionLog,
		commandOptions
	);

	// wait for messages
	parentPort.on('message', async (payload: WorkerTaskPayload) => {
		const result = await workerHandlerCallback(payload);

		// send task result back
		parentPort.postMessage({
			threadId: payload.threadId,
			taskId: payload.taskId,
			result,
		} as WorkerTaskResultPayload);
	});

	// send synchronisation message to let the parent thread know this thread is ready
	parentPort.postMessage(WORKER_READY_MESSAGE);
}

export default isMainThread ? threaderMainHandler : threaderWorkerHandler;

export { isMainThread };
