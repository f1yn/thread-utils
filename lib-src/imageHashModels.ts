import { Sequelize, DataTypes, Model, Optional } from 'sequelize';

interface ImageAttributes {
	id: number;
	bytes: number;
	hash: string;
	path: string;
	processed: boolean;
	groupId?: number;
}

interface ImageCreateAttributes extends Optional<ImageAttributes, 'id'> {}

export interface ImageInstance
	extends Model<ImageAttributes, ImageCreateAttributes>,
		ImageAttributes {}

interface GroupAttributes {
	id: number;
	hash: string;
}

interface GroupCreateAttributes extends Optional<GroupAttributes, 'id'> {}

export interface GroupInstance
	extends Model<GroupAttributes, GroupCreateAttributes>,
		GroupAttributes {
	images?: ImageInstance[];
}

/**
 * Connect to existing database - return the Sequelize Model definitions
 */
export async function connectAndBuildModels() {
	// build and test connection
	const sequelize = new Sequelize(process.env.DB_URL, {
		logging: false,
	});
	await sequelize.authenticate();

	const Image = sequelize.define<ImageInstance>(
		'images',
		{
			id: {
				type: DataTypes.INTEGER,
				autoIncrement: true,
				primaryKey: true,
			},
			bytes: {
				type: DataTypes.BIGINT,
				allowNull: false,
			},
			hash: {
				type: new DataTypes.STRING(255),
				allowNull: false,
			},
			path: {
				type: DataTypes.TEXT,
				allowNull: false,
			},
			processed: {
				type: DataTypes.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			},
		},
		{
			tableName: 'images',
			timestamps: false,
		}
	);

	const Group = sequelize.define<GroupInstance>(
		'groups',
		{
			id: {
				type: DataTypes.INTEGER,
				autoIncrement: true,
				primaryKey: true,
			},
			hash: {
				type: new DataTypes.STRING(255),
				allowNull: false,
			},
		},
		{
			tableName: 'groups',
			timestamps: false,
		}
	);

	// define associations
	Image.belongsTo(Group, { foreignKey: 'groupId' });
	Group.hasMany(Image);

	// return interface
	return {
		sequelize,
		Image,
		Group,
	};
}

/**
 * Sync model definitions and wipe the specified tables.
 * Returns the Sequelize Model definitions.
 */
export async function syncModels() {
	const modelsInterface = await connectAndBuildModels();
	// synchronise models and indexes
	await modelsInterface.sequelize.sync({ force: true });
	return modelsInterface;
}
