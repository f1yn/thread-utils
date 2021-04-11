import minimist from 'minimist';

// parse global command arguments
global.commandOptions = minimist(Array.from(process.argv).slice(2));

// pick a known script
const knownScripts = new Map([
	['dedupe', () => import('./utils/dedupe-images')],
]);

const [scriptName] = commandOptions._;
const loadScript = knownScripts.get(scriptName);

if (!loadScript) {
	throw new Error(`The script ${scriptName} is not recognized`);
}

// load module (with esm)
await loadScript();
