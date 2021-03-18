import pLimit from 'p-limit';
import debug from './log';
import { isMainThread, parentPort, Worker } from 'worker_threads';
import { v4 as uuid } from 'uuid';

import { getOptions, genericAnyCommandOptions } from './options';

type threaderSharedConfiguration = genericAnyCommandOptions & {
	script: string;
};

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

interface WorkerTaskResultPayload {
	threadId: number;
	taskId: string;
	result: any;
}

const log = debug('threader');

const WORKER_READY_MESSAGE = 'READY!!';

async function threaderMainHandler(
	script,
	mainContextCallback,
	_workerContextCallback
) {
	// get snapshot of command options
	const commandOptions = getOptions();

	const threadingConcurrency = commandOptions.threadingConcurrency || 6;

	// store workers in a circular linked array
	const allWorkersCircular = [];

	// setup all workers
	let count = threadingConcurrency;
	log('started setting up threads required for processing');

	while (count--) {
		const threadId = threadingConcurrency - count;

		const workerNode: Partial<WorkerNode> = {
			id: threadId,
			worker: new Worker(script, {
				workerData: {
					...commandOptions,
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
	console.log('wait for worker inits');
	await Promise.all(
		allWorkersCircular.map((workerNodeRef) => workerNodeRef.readyPromise)
	);
	console.log('all workers ready!');

	// set ref pointing to first thread
	let workerIterator = allWorkersCircular[allWorkersCircular.length - 1];

	function sentToThreadAndWait(data: any) {
		// iterate selected worker first
		workerIterator = workerIterator.next;
		const currentSelectedThread = workerIterator;
		const taskId = uuid();

		// create promise that resolves when the task resolves
		const pendingTaskPromise = new Promise((resolve) => {
			// wait for task
			function waitForTaskCompletion(result: WorkerTaskResultPayload) {
				if (result.taskId !== taskId) return;
				// unbind listener for this task
				log('task', taskId, 'completed');
				currentSelectedThread.worker.removeListener(
					'message',
					waitForTaskCompletion
				);
				resolve(result);
			}

			// attach listener
			log('task', taskId, 'sent');
			currentSelectedThread.worker.addListener(
				'message',
				waitForTaskCompletion
			);
		});

		// initiate the job
		currentSelectedThread.worker.postMessage({
			taskId,
			threadId: currentSelectedThread.id,
			data,
		});

		return pendingTaskPromise;
	}
	// run the main context callback
	mainContextCallback(sentToThreadAndWait);
}

async function threaderWorkerHandler(
	_script,
	_mainContextCallback,
	workerContextCallback
) {
	// get command options from the worker arguments
	const commandOptions = getOptions();

	// generate closure needed for thread handling
	const workerHandlerCallback = await workerContextCallback(commandOptions);

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
