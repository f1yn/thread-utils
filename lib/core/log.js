import { workerData } from 'worker_threads';
function selectColor(namespace) {
    let hash = 0;
    for (let i = 0; i < namespace.length; i++) {
        hash = (hash << 5) - hash + namespace.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash) % 16;
}
export default function logger(...namespaces) {
    const prependParts = [...namespaces];
    if (workerData && workerData.threadId) {
        prependParts.push('thread:' + workerData.threadId);
    }
    const logPrepend = prependParts.map((item) => '[' + item + ']').join(' ');
    return (...parts) => console.error(logPrepend, ...parts);
}
