module.exports = {
	up: (queryInterface, Sequelize) => {
		return queryInterface.createTable('OTS', {
			id: {
				type: Sequelize.INTEGER,
				primaryKey: true,
			},
			Block_id: {
				type: Sequelize.STRING(64),
				allowNull: false,
			},
			sha256: {
				type: Sequelize.STRING(64),
				allowNull: false,
			},
			ots: {
				type: Sequelize.TEXT('medium'),
				allowNull: false,
			},
			data: {
				type: Sequelize.TEXT('medium'),
				allowNull: false,
			},
			upgraded_ots: {
				type: Sequelize.TEXT('medium'),
				allowNull: true,
			},
		},{
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
		return queryInterface.dropTable('OTS')
	}
}
