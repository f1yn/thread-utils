import 'dotenv/config';

import os from 'os';
import { workerData } from 'worker_threads';

const allCoresCount = os.cpus().length;

export interface genericAnyCommandOptions {
	// total number of threads that will be performing asynchronous tasks
	threadingConcurrency?: number;
	// additional configurations
	[key: string]: any;
}

let optionsSingletonStorage: genericAnyCommandOptions | null =
	workerData || null;

/**
 * Bind arguments for the main process. Since threader runs in the
 * default execution context this is required
 * @param commandOptions
 */
export function setOptions(commandOptions: genericAnyCommandOptions): void {
	const defaultWithMax = (value, defaultMax) =>
		Math.min(Math.ceil(defaultMax || defaultMax), defaultMax);

	const options = {
		...commandOptions,
		threadingConcurrency: defaultWithMax(
			commandOptions.threadingConcurrency,
			Math.floor(allCoresCount / 2)
		),
	};

	console.log('using configuration', options);
	optionsSingletonStorage = options;
}

/**
 * Fetch the current command arguments
 */
export function getOptions(): genericAnyCommandOptions | null {
	const fetchedArgs = optionsSingletonStorage;

	if (!fetchedArgs) {
		throw new Error(
			'getOptions was called before options were set. This is a scripting error. Cancelling execution'
		);
	}

	return fetchedArgs;
}
