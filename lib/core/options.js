import { workerData } from 'worker_threads';
let optionsSingletonStorage = workerData || null;
export function setOptions(commandOptions) {
    optionsSingletonStorage = commandOptions;
}
export function getOptions() {
    const fetchedArgs = optionsSingletonStorage;
    if (!fetchedArgs) {
        throw new Error('getOptions was called before options were set. This is a scripting error. Cancelling execution');
    }
    return fetchedArgs;
}
