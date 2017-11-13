/* jshint indent: 1 */
module.exports = function(sequelize, DataTypes) {
	const Block = sequelize.define('Block', {
		id: {
			type: DataTypes.STRING(64),
			primaryKey: true,
		},
		Block_id: {
			type: DataTypes.STRING(64),
			allowNull: true,
		},
		Twitter_user_id: {
			type: DataTypes.STRING(64),
			allowNull: false
		},
		protocol: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		block_number: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		confirmed: {
			type: DataTypes.BOOLEAN,
			defaultValue: false
		},
		orphaned: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
		},
		deleted: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
		},
		text: {
			type: DataTypes.STRING(300),
			allowNull: true,
		},
		Twitter_created_at: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		Twitter_retweet_count: {
			type: DataTypes.INTEGER,
			defaultValue: 0,
		},
		Twitter_favorite_count: {
			type: DataTypes.INTEGER,
			defaultValue: 0,
		},
		Twitter_user_name: {
			type: DataTypes.STRING(50),
			allowNull: true
		},
		Twitter_user_screen_name: {
			/* https://developer.twitter.com/en/docs/tweets/data-dictionary/overview/user-object */
			/* Typically a maximum of 15 characters long, but some historical accounts may exist with longer names*/
			type: DataTypes.STRING(32),
			allowNull: true
		},
		Twitter_user_description: {
			type: DataTypes.STRING(256),
			allowNull: true
		},
		Twitter_user_verified: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
		},
		Twitter_user_followers_count: {
			type: DataTypes.INTEGER,
			defaultValue: 0,
		},
		Twitter_user_friends_count: {
			type: DataTypes.INTEGER,
			defaultValue: 0,
		},
		Twitter_user_created_at: {
			type: DataTypes.DATE,
			allowNull: true,
		},
	},{
		tableName: 'Block',
		paranoid: true,
		timestamps: true,
		createdAt: 'created_at',
		updatedAt: 'updated_at',
		deletedAt: 'deleted_at'
	});

	Block.associate = function(models) {
	// 	Block.hasMany(Block, { as: 'children', foreignKey: 'Block_id', constraints: false, })
	// 	Block.belongsTo(Block, { as: 'parent', foreignKey: 'Block_id', constraints: false, })
	};

	Block.isHierarchy({
		foreignKey: 'Block_id',
		as: 'parent',
	});

	return Block;
};
