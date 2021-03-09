import threader from './core/threader';
import scanner from './core/scanner';

// this needs to be called at module scope
await threader(
	{
		script: __filename,
		threadCount: 6,
	},
	async function pipeToThreads(commandOptions, sendToThread) {
		// start scanning specified directory
		await scanner(
			commandOptions.sourceDir,
			/\.(jpg|jpeg|tiff|png)/i,
			async (imagePath) => {
				// send path to worker with sendToThread
			}
		);
	},
	async function processImage(commandOptions, imageData) {
		// load image to memory
		console.log(imageData);
	}
);
