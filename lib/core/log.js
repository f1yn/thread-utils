import { workerData } from 'worker_threads';
function selectColor(namespace) {
    let hash = 0;
    for (let i = 0; i < namespace.length; i++) {
        hash = (hash << 5) - hash + namespace.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 16;
}
export default function logger(namespace) {
    const prependParts = [namespace];
    if (workerData && workerData.threadId) {
        prependParts.unshift('thread:' + workerData.threadId);
    }
    const logPrepend = prependParts.map((item) => '[' + item + ']').join(' | ');
    return (...parts) => console.error(logPrepend, ...parts);
}
