/* jshint indent: 1 */
module.exports = function(sequelize, DataTypes) {
	const Block = sequelize.define(
		'Block',
		{
			id: {
				type: DataTypes.STRING(64),
				// allowNull: false,
				primaryKey: true,
			},
			Block_id: {
				type: DataTypes.STRING(64),
				allowNull: false
			},
			block_number: {
				type: DataTypes.INTEGER,
				allowNull: false
			},
			text: {
				type: DataTypes.STRING(300),
				allowNull: false
			},
		},
		{
			tableName: 'Block',
			paranoid: true,
			timestamps: true,
			createdAt: 'created_at',
			updatedAt: 'updated_at',
			deletedAt: 'deleted_at'
		}
	)

	Block.associate = function(models) {
		Block.hasOne(Block, { foreignKey: 'Block_id' })
		// Block.hasMany(models.AlarmReceipt, { foreignKey: 'alarmId' })
	}

	return Block
}
