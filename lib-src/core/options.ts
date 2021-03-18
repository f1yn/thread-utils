import { workerData } from 'worker_threads';

export interface genericAnyCommandOptions {
	// total number of concurrent tasks being applied from the primary process
	taskConcurrency?: number;
	// total number of threads that will be performing asynchronous tasks
	threadingConcurrency?: number;
	// additional configurations
	[key: string]: any;
}

// TODO: multiply task concurrency by threading concurrency number (i.e 100 tasks per thread)

let optionsSingletonStorage: genericAnyCommandOptions | null =
	workerData || null;

/**
 * Bind arguments for the main process. Since threader runs in the
 * default execution context this is required
 * @param commandOptions
 */
export function setOptions(commandOptions: genericAnyCommandOptions): void {
	optionsSingletonStorage = commandOptions;
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
