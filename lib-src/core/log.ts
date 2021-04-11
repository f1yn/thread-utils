import { workerData } from 'worker_threads';

export default function logger(...namespaces: string[]) {
	const prependParts: string[] = [...namespaces];

	if (workerData && workerData.threadId) {
		prependParts.push('thread:' + workerData.threadId);
	}

	const logPrepend = prependParts.map((item) => '[' + item + ']').join(' ');
	return (...parts: any[]) => console.error(logPrepend, ...parts);
}
