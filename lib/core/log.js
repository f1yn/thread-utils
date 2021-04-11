import { workerData } from 'worker_threads';
export default function logger(...namespaces) {
    const prependParts = [...namespaces];
    if (workerData && workerData.threadId) {
        prependParts.push('thread:' + workerData.threadId);
    }
    const logPrepend = prependParts.map((item) => '[' + item + ']').join(' ');
    return (...parts) => console.error(logPrepend, ...parts);
}
