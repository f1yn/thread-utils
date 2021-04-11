import { getOptions, defaultByType } from './core/options';
import {
	imageHashTypeOptions,
	levenCalculationResults,
} from './imageHashSharedTypes';

const commandOptions = <imageHashTypeOptions>getOptions();

const levenResolution = defaultByType(
	commandOptions.levenResolution,
	'number',
	1024
);

const levenThreshold = defaultByType(
	commandOptions.levenThreshold,
	'number',
	12
);

const limitByLevenThreshold = (results) =>
	results.filter((result) => result.leven <= levenThreshold);

/**
 * Calculates levenshtein distance between a single hash, in comparison to all
 * other eligible images in the database
 * @param hash
 */
async function lazyPerformLevenshteinComparisons(
	models,
	log,
	hash: string
): Promise<levenCalculationResults> {
	const [results] = await models.sequelize.query(
		`
			create extension if not exists fuzzystrmatch;
			select id, levenshtein(hash, ?) as leven from images
			where "groupId" is null and
			processed = false
			order by leven ASC
			limit ?
		`,
		{ replacements: [hash, levenResolution] }
	);

	// Only return matches that are less than or equal to the leven threshold
	return limitByLevenThreshold(results) as levenCalculationResults;
}

async function topPerformLevenshteinComparisons(
	models,
	log,
	hash: string
): Promise<levenCalculationResults> {
	let [[groupResults], [imageResults]] = await Promise.all([
		models.sequelize.query(
			`
			create extension if not exists fuzzystrmatch;
			select id as "groupId", levenshtein(hash, ?) as leven from groups
			order by leven ASC
			limit ?
		`,
			{ replacements: [hash, levenResolution] }
		),
		models.sequelize.query(
			`
			create extension if not exists fuzzystrmatch;
			select id, levenshtein(hash, ?) as leven from images
			where "groupId" is null and
			processed = false
			order by leven ASC
			limit ?
		`,
			{ replacements: [hash, levenResolution] }
		),
	]);

	// combine group and image results, and prefer the closest permutation
	const allResults = []
		.concat(
			limitByLevenThreshold(groupResults),
			limitByLevenThreshold(imageResults)
		)
		// sort by leven value
		.sort((resultA, resultB) => resultA.leven - resultB.leven);

	// nudge GC
	groupResults = null;
	imageResults = null;

	return allResults as levenCalculationResults;
}

/**
 * If matches are present, creates a new Group containing the primary image
 * @param primaryImage
 * @param allMatches
 */
async function lazyAssignMatchesToGroup(
	models,
	log,
	primaryImage,
	allMatches: levenCalculationResults
) {
	// first build new group
	const newGroup = await models.Group.create({
		hash: primaryImage.get('hash'),
	});

	// build set of ids for bulk update
	const matchesByImageId = [
		// primary image
		primaryImage.get('id'),
		// any matches
		...allMatches.map((match) => match.id),
	];

	log('grouping', allMatches.length, 'images');

	// add matching images to group
	await models.sequelize.query(
		`
			UPDATE images
			set "groupId" = ?
			where id in (?)
			and "groupId" is null
		`,
		{
			replacements: [newGroup.get('id'), matchesByImageId],
		}
	);
}

async function topAssignMatchesToGroup(
	models,
	log,
	primaryImage,
	allMatches: levenCalculationResults
) {
	let targetGroupId;
	let usingExisting = false;

	if (allMatches[0] && allMatches[0].groupId) {
		targetGroupId = allMatches[0].groupId;
		usingExisting = true;
	} else {
		const newGroup = await models.Group.create({
			hash: primaryImage.get('hash'),
		});
		targetGroupId = newGroup.get('id');
	}

	// any matches that are only images
	const imageMatches = allMatches
		.filter((m) => m.id)
		.map((match) => match.id);

	// build set of ids for bulk update
	const matchesByImageId = [
		// primary image
		primaryImage.get('id'),
		// other matching mages
		...imageMatches,
	];

	log(
		'placing',
		matchesByImageId.length,
		matchesByImageId.length === 1 ? 'image' : 'images',
		usingExisting ? 'into an existing group' : 'into a new group'
	);

	// add matching images to group
	await models.sequelize.query(
		`
			UPDATE images
			set "groupId" = ?
			where id in (?)
			and "groupId" is null
		`,
		{
			replacements: [targetGroupId, matchesByImageId],
		}
	);
}

export const performLevenshteinComparisons = new Map([
	['lazy', lazyPerformLevenshteinComparisons],
	['top', topPerformLevenshteinComparisons],
]).get(commandOptions.mode);

export const assignMatchesToGroup = new Map([
	['lazy', lazyAssignMatchesToGroup],
	['top', topAssignMatchesToGroup],
]).get(commandOptions.mode);
