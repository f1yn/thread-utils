import 'dotenv/config';

import os from 'os';
import { workerData } from 'worker_threads';

const allCoresCount = os.cpus().length;

export interface genericCommandOptions {
	// total number of threads that will be performing asynchronous tasks
	threadingConcurrency?: number;
}

let optionsSingletonStorage = workerData || null;

/**
 * Bind arguments for the main process. Since threader runs in the
 * default execution context this is required
 * @param commandOptions
 */
export function setOptions<T extends genericCommandOptions>(
	commandOptions: T
): void {
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
 * Applies a default value when the provided source value has a mismatches type
 * @param source
 * @param typeString
 * @param defaultValue
 */
export const defaultByType = <PrefType>(
	source: PrefType,
	typeString: string,
	defaultValue: PrefType
): PrefType => (typeof source !== typeString ? defaultValue : source);

/**
 * Fetch the current command arguments
 */
export function getOptions<T extends genericCommandOptions>(): T | null {
	const fetchedArgs = optionsSingletonStorage as T;

	if (!fetchedArgs) {
		throw new Error(
			'getOptions was called before options were set. This is a scripting error. Cancelling execution'
		);
	}

	return fetchedArgs;
}
