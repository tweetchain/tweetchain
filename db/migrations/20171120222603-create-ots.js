module.exports = {
	up: (queryInterface, Sequelize) => {
		return queryInterface.createTable('OTS', {
			id: {
				type: Sequelize.INTEGER,
				primaryKey: true,
			},
			sha256: {
				type: Sequelize.STRING(64),
				allowNull: false,
			},
			data: {
				type: Sequelize.TEXT('medium'),
				allowNull: false,
			},
			ots: {
				type: Sequelize.TEXT('medium'),
				allowNull: true,
			},
			upgraded_ots: {
				type: Sequelize.TEXT('medium'),
				allowNull: true,
			},
			created_at: {
				type: Sequelize.DATE,
				allowNull: false,
			},
			updated_at: {
				type: Sequelize.DATE,
				allowNull: false,
			},
			deleted_at: {
				type: Sequelize.DATE,
				allowNull: true,
			},
		});
	},
	down: (queryInterface, Sequelize) => {
		return queryInterface.dropTable('OTS');
	}
}
