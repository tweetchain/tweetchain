/* jshint indent: 1 */
module.exports = function(sequelize, DataTypes) {
	const OTS = sequelize.define('OTS', {
		id: {
			type: DataTypes.INTEGER,
			primaryKey: true,
		},
		Block_id: {
			type: DataTypes.STRING(64),
			allowNull: false,
		},
		sha256: {
			type: DataTypes.STRING(64),
			allowNull: false,
		},
		ots: {
			type: DataTypes.TEXT('medium'),
			allowNull: false,
		},
		data: {
			type: DataTypes.TEXT('medium'),
			allowNull: false,
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
		// OTS.belongsTo(models.Block, { targetKey: 'id', foreignKey: 'Block_id', })
	};

	return OTS;
};
