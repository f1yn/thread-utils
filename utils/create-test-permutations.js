import fs from 'fs/promises';
import path from 'path';

import { v4 as uuid } from 'uuid';
import sharp from 'sharp';

import { forEachIndividualFile } from '../dist/scanner';

const sourceDir = path.resolve('./sandbox/assets');
const outputDir = path.resolve('./sandbox/testdata');

// remove original output directory and replace
await fs.rmdir(outputDir, { recursive: true });
await fs.mkdir(outputDir);

// walk the asset source directory and begin creating permutations of each file
await forEachIndividualFile(sourceDir, /\.jpg$/i, async (originalFilePath) => {
	console.log('processing', path.basename(originalFilePath));

	// load in source file
	const sourceStream = sharp(originalFilePath);

	const meta = await sourceStream.metadata();

	const allVariations = [
		{
			target: 'png',
			quality: 100,
		},
		{
			target: 'jpeg',
			quality: 60,
		},
		{
			target: 'jpeg',
			resize: 0.5,
			quality: 60,
		},
		{
			target: 'tiff',
			resize: 0.5,
		},
		{
			target: 'jpeg',
			quality: 60,
			resize: 2,
		},
		{
			target: 'jpeg',
			quality: 100,
			resize: 0.2,
		},
	];

	await Promise.all(
		allVariations.map(async (variation) => {
			await sourceStream
				.clone()
				.toFormat(variation.target, {
					quality: variation.quality || 75,
				})
				.resize(Math.floor((variation.resize || 1) * meta.width))
				.toFile(path.join(outputDir, `${uuid()}.${variation.target}`));
		})
	);
});
