/* jshint indent: 1 */
module.exports = function(sequelize, DataTypes) {
	const Block = sequelize.define('Block', {
		id: {
			type: DataTypes.STRING(64),
			primaryKey: true,
		},
		Block_id: {
			type: DataTypes.STRING(64),
			allowNull: true
		},
		Tweeter_id: {
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
			defaultValue: false
		},
		text: {
			type: DataTypes.STRING(300),
			allowNull: false
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
		Block.hasMany(Block, { as: 'children', foreignKey: 'Block_id', constraints: false, })
		Block.belongsTo(Block, { as: 'parent', foreignKey: 'Block_id', constraints: false, })
	};

	return Block;
};
