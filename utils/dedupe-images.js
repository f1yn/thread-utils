import setScriptOptions from '../lib/core/options';

setScriptOptions({
	sourceDirectory: '../sandbox/testdata',
});

await import('../lib/imageHash');
