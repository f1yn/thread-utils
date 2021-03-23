import { Sequelize, DataTypes } from 'sequelize';

export async function connectAndBuildModels() {
	// build and test connection
	const sequelize = new Sequelize(process.env.DB_URL, {
		logging: false,
	});
	await sequelize.authenticate();

	const Image = sequelize.define(
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

	const Group = sequelize.define(
		'groups',
		{
			id: {
				type: DataTypes.INTEGER,
				autoIncrement: true,
				primaryKey: true,
			},
		},
		{
			tableName: 'groups',
			timestamps: false,
		}
	);

	// define associations
	Image.belongsTo(Group);
	Group.hasMany(Image);

	// return interface
	return {
		sequelize,
		Image,
		Group,
	};
}

export async function syncModels() {
	const modelsInterface = await connectAndBuildModels();
	// synchronise models and indexes
	await modelsInterface.sequelize.sync({ force: true });
	return modelsInterface;
}
