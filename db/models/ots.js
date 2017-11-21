/* jshint indent: 1 */
module.exports = function(sequelize, DataTypes) {
	const OTS = sequelize.define('OTS', {
		id: {
			type: DataTypes.INTEGER,
			primaryKey: true,
			autoIncrement: true,
		},
		Block_id: {
			type: DataTypes.STRING(64),
			allowNull: false,
			references: {
				model: 'Block',
				key: 'id',
			},
		},
		sha256: {
			type: DataTypes.STRING(64),
			allowNull: false,
		},
		data: {
			type: DataTypes.TEXT('medium'),
			allowNull: false,
		},
		ots: {
			type: DataTypes.TEXT('medium'),
			allowNull: true,
		},
		upgraded_ots: {
			type: DataTypes.TEXT('medium'),
			allowNull: true,
		},
	},{
		tableName: 'OTS',
		paranoid: true,
		timestamps: true,
		createdAt: 'created_at',
		updatedAt: 'updated_at',
		deletedAt: 'deleted_at'
	});

	OTS.associate = function(models) {
		OTS.belongsTo(models.Block, { as: 'block', foreignKey: 'id', targetKey: 'Block_id', })
	};

	return OTS;
};
