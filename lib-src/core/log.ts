import { workerData } from 'worker_threads';

// "borrowed" from https://github.com/visionmedia/debug/blob/e47f96de3de5921584364b4ac91e2769d22a3b1f/src/common.js#L35-L50

/**
 * Selects a color for a debug namespace
 * @param {String} namespace The namespace string for the for the debug instance to be colored
 * @return {Number|String} An ANSI color code for the given namespace
 * @api private
 */
function selectColor(namespace) {
	let hash = 0;

	for (let i = 0; i < namespace.length; i++) {
		hash = (hash << 5) - hash + namespace.charCodeAt(i);
		hash |= 0; // Convert to 32bit integer
	}

	return Math.abs(hash) % 16;
}

export default function logger(namespace) {
	const prependParts = [namespace];
	if (workerData && workerData.threadId) {
		prependParts.unshift('thread:' + workerData.threadId);
	}
	const logPrepend = prependParts.map((item) => '[' + item + ']').join(' | ');
	// console.log('color hash', selectColor(logPrepend));
	return (...parts) => console.error(logPrepend, ...parts);
}
