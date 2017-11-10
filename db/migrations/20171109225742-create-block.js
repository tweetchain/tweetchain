module.exports = {
	up: (queryInterface, Sequelize) => {
		return queryInterface.createTable('Block', {
			id: {
				type: DataTypes.STRING(64),
				// allowNull: false,
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
			createdAt: {
				type: Sequelize.DATE
			},
			updatedAt: {
				type: Sequelize.DATE
			},
			deletedAt: {
				type: Sequelize.DATE
			}
		})
	},
	down: (queryInterface, Sequelize) => {
		return queryInterface.dropTable('Block')
	}
}
