import { isMainThread, workerData } from 'worker_threads';
import { getOptions, setOptions } from './options';

interface threaderSharedConfiguration {
	script: string;
	threadCount: number;
}

async function threaderMainHandler(
	configuration: threaderSharedConfiguration,
	mainContextCallback,
	_workerContextCallback
) {
	const commandOptions = getOptions();
	// setup all workers

	// create generic send command (for sending messages to each worker - one after the other) through a p-queue

	// run the main context callback
}

async function threaderWorkerHandler(
	configuration: threaderSharedConfiguration,
	_mainContextCallback,
	workerContextCallback
) {
	// get command options from the worker arguments
	const commandOptions = workerData;

	console.log(workerData);

	// wait for messages
}

export default isMainThread ? threaderMainHandler : threaderWorkerHandler;
