import 'dotenv/config';
import os from 'os';
import { workerData } from 'worker_threads';
const allCoresCount = os.cpus().length;
let optionsSingletonStorage = workerData || null;
export function setOptions(commandOptions) {
    const defaultWithMax = (value, defaultMax) => Math.min(Math.ceil(defaultMax || defaultMax), defaultMax);
    const options = {
        ...commandOptions,
        threadingConcurrency: defaultWithMax(commandOptions.threadingConcurrency, Math.floor(allCoresCount / 2)),
    };
    console.log('using configuration', options);
    optionsSingletonStorage = options;
}
export function getOptions() {
    const fetchedArgs = optionsSingletonStorage;
    if (!fetchedArgs) {
        throw new Error('getOptions was called before options were set. This is a scripting error. Cancelling execution');
    }
    return fetchedArgs;
}
