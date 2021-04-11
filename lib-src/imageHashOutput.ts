import path from 'path';
import fs from 'fs/promises';

import fileSize from 'filesize/lib/filesize.es6';
import chunk from 'lodash/chunk';

import { GroupInstance } from './imageHashModels';
import { imageHashTypeOptions } from './imageHashSharedTypes';

import logger from './core/log';
import { getOptions, defaultByType } from './core/options';
import { handleBatchWithRedundancy } from './core/utilities';

const commandOptions = <imageHashTypeOptions>getOptions();

const log = logger('output');

/**
 * Takes the state from the DB and generates sandbox/index.html
 * @param models
 */
export async function outputToHtml(models) {
	const groupedResults = await models.Group.findAll({
		include: [models.Group.associations.images],
		order: [['id', 'ASC']],
	});

	const imageGroup = (groupIdentifier: any, images: any[]) => {
		const output = [
			`<section id="${groupIdentifier}">`,
			`<h2>${groupIdentifier}</h2>`,
			`<div>`,
			...images.map((image) =>
				[
					`<article>`,
					`<img src="${image.path}" />`,
					`<b>${fileSize(image.bytes)}</b>`,
					`</article>`,
				].join('\n')
			),
			`</div>`,
		];

		return output.join('\n');
	};

	// get path to index file to generate
	const file = path.join('./sandbox', '/index.html');

	// write start of file
	await fs.writeFile(
		file,
		`<!doctype html>
<html lang="en">
	<head>
	  <meta charset="utf-8">
	  <meta name="viewport" content="width=device-width">
	  <title>Image Results</title>
	  <style>
	  	img { max-width: 256px; height: auto; }
	  	div {
	  		display: flex;
	  		flex-wrap: wrap;
	  	}
	  	div article {
	  		margin: 20px;
	  	}
	  	article > b {
	  		display: block;
	  	}
	  </style>
	</head>
	<body>
`
	);

	const dataPort = 5000;

	let imageItems;

	for (const group of groupedResults) {
		imageItems = group.images
			.sort((a, b) => b.bytes - a.bytes)
			.map((image) => ({
				...image.get(),
				path: `http://localhost:${dataPort}/${path.relative(
					commandOptions.sourceDirectory,
					image.path
				)}`,
			}));

		await fs.appendFile(
			file,
			imageGroup(`${group.id} (${imageItems.length})`, [imageItems[0]])
		);
	}

	await fs.appendFile(file, `</body>`);

	const { serveStaticDirectory } = await import('./core/serve');

	// serve assets
	await Promise.all([
		serveStaticDirectory(commandOptions.sourceDirectory, dataPort),
		serveStaticDirectory(path.resolve('./sandbox'), 5001),
	]);
}

/**
 * Takes the state of the DB and will clone the highest-size image per group to a local sandbox folder
 * @param models
 */
export async function outputCopyTo(models) {
	const groupBatchSize = defaultByType(
		commandOptions.outputCopyBatchSize,
		'number',
		12
	);

	const allGroupBatches: GroupInstance[][] = chunk(
		await models.Group.findAll({
			order: [['id', 'ASC']],
			attributes: ['id'],
		}),
		groupBatchSize
	);

	const folderName = new Date().toISOString().replace(/(:|\.)/g, '-');
	const outputFolder = path.join(__dirname, '../sandbox', `./${folderName}`);

	// build folder
	await fs.mkdir(outputFolder);

	for (const groupBatch of allGroupBatches) {
		await handleBatchWithRedundancy(
			groupBatch,
			async (group) => {
				const groupId = group.get('id');

				// get the largest image in this group
				const [largestImage] = await models.Image.findAll({
					where: {
						groupId,
					},
					order: [['bytes', 'DESC']],
					attributes: ['groupId', 'bytes', 'path'],
					limit: 1,
				});

				const destFileName = `${groupId}${path.extname(
					largestImage.path
				)}`;

				log('copying file', destFileName);
				// copy file
				await fs.copyFile(
					largestImage.path,
					path.join(outputFolder, destFileName)
				);
				log('done copying file', destFileName);
			},
			log
		);
	}
}

/**
 * Takes the state of the DB and will count (then print) the number of images stored in the DB
 * @param models
 */
export async function outputDryRunStats(models) {
	const count = await models.Image.count();
	console.info('[DEBUG] approximately', count, 'images would be processed');
}
