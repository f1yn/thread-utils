import { getOptions, defaultByType } from './core/options';
const commandOptions = getOptions();
const levenResolution = defaultByType(commandOptions.levenResolution, 'number', 1024);
const levenThreshold = defaultByType(commandOptions.levenThreshold, 'number', 12);
const limitByLevenThreshold = (results) => results.filter((result) => result.leven <= levenThreshold);
async function lazyPerformLevenshteinComparisons(models, log, hash) {
    const [results] = await models.sequelize.query(`
			create extension if not exists fuzzystrmatch;
			select id, levenshtein(hash, ?) as leven from images
			where "groupId" is null and
			processed = false
			order by leven ASC
			limit ?
		`, { replacements: [hash, levenResolution] });
    return limitByLevenThreshold(results);
}
async function topPerformLevenshteinComparisons(models, log, hash) {
    let [[groupResults], [imageResults]] = await Promise.all([
        models.sequelize.query(`
			create extension if not exists fuzzystrmatch;
			select id as "groupId", levenshtein(hash, ?) as leven from groups
			order by leven ASC
			limit ?
		`, { replacements: [hash, levenResolution] }),
        models.sequelize.query(`
			create extension if not exists fuzzystrmatch;
			select id, levenshtein(hash, ?) as leven from images
			where "groupId" is null and
			processed = false
			order by leven ASC
			limit ?
		`, { replacements: [hash, levenResolution] }),
    ]);
    const allResults = []
        .concat(limitByLevenThreshold(groupResults), limitByLevenThreshold(imageResults))
        .sort((resultA, resultB) => resultA.leven - resultB.leven);
    groupResults = null;
    imageResults = null;
    return allResults;
}
async function lazyAssignMatchesToGroup(models, log, primaryImage, allMatches) {
    if (!allMatches.length)
        return;
    const newGroup = await models.Group.create({
        hash: primaryImage.get('hash'),
    });
    const matchesByImageId = [
        primaryImage.get('id'),
        ...allMatches.map((match) => match.id),
    ];
    log('grouping', allMatches.length, 'images');
    await models.sequelize.query(`
			UPDATE images
			set "groupId" = ?
			where id in (?)
			and "groupId" is null
		`, {
        replacements: [newGroup.get('id'), matchesByImageId],
    });
}
async function topAssignMatchesToGroup(models, log, primaryImage, allMatches) {
    if (!allMatches.length)
        return;
    let targetGroupId;
    if (allMatches[0].groupId) {
        log('using existing group for assignment');
        targetGroupId = allMatches[0].groupId;
    }
    else {
        log('using new group for assignment');
        const newGroup = await models.Group.create({
            hash: primaryImage.get('hash'),
        });
        targetGroupId = newGroup.get('id');
    }
    const imageMatches = allMatches
        .filter((m) => m.id)
        .map((match) => match.id);
    const matchesByImageId = [
        primaryImage.get('id'),
        ...imageMatches,
    ];
    log('grouping', allMatches.length, 'images');
    await models.sequelize.query(`
			UPDATE images
			set "groupId" = ?
			where id in (?)
			and "groupId" is null
		`, {
        replacements: [targetGroupId, matchesByImageId],
    });
}
export const performLevenshteinComparisons = new Map([
    ['lazy', lazyPerformLevenshteinComparisons],
    ['top', topPerformLevenshteinComparisons],
]).get(commandOptions.mode);
export const assignMatchesToGroup = new Map([
    ['lazy', lazyAssignMatchesToGroup],
    ['top', topAssignMatchesToGroup],
]).get(commandOptions.mode);
