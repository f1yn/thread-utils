const GENERIC_COMMAND_OPTIONS_KEY = '__threaderCommandOptions';

interface genericAnyCommandOptions {
	[key: string]: any;
}

/**
 * Bind arguments for the main process. Since threader runs in the
 * default execution context this is required
 * @param commandOptions
 */
export function setOptions(commandOptions: genericAnyCommandOptions): void {
	global[GENERIC_COMMAND_OPTIONS_KEY] = commandOptions;
}

/**
 * Fetch the current command arguments
 */
export function getOptions(): genericAnyCommandOptions | null {
	const fetchedArgs = global[GENERIC_COMMAND_OPTIONS_KEY];

	if (!fetchedArgs) {
		throw new Error(
			'getOptions was called before options were set. This is a scripting error. Cancelling execution'
		);
	}

	return fetchedArgs;
}
