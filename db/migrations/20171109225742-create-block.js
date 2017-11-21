module.exports = {
	up: (queryInterface, Sequelize) => {
		return queryInterface.createTable('Block', {
			id: {
				type: Sequelize.STRING(64),
				// allowNull: false,
				primaryKey: true,
			},
			Block_id: {
				type: Sequelize.STRING(64),
				allowNull: true
			},
			Twitter_user_id: {
				type: Sequelize.STRING(64),
				allowNull: true,
			},
			protocol: {
				type: Sequelize.INTEGER,
				allowNull: false
			},
			block_number: {
				type: Sequelize.INTEGER,
				allowNull: false,
			},
			confirmed: {
				type: Sequelize.BOOLEAN,
				defaultValue: false
			},
			orphaned: {
				type: Sequelize.BOOLEAN,
				defaultValue: false
			},
			deleted: {
				type: Sequelize.BOOLEAN,
				defaultValue: false,
			},
			text: {
				type: Sequelize.STRING(300),
				allowNull: true,
			},
			Twitter_created_at: {
				type: Sequelize.DATE,
				allowNull: true,
			},
			Twitter_retweet_count: {
				type: Sequelize.INTEGER,
				defaultValue: 0,
			},
			Twitter_favorite_count: {
				type: Sequelize.INTEGER,
				defaultValue: 0,
			},
			Twitter_user_name: {
				type: Sequelize.STRING(50),
				allowNull: true
			},
			Twitter_user_screen_name: {
				/* https://developer.twitter.com/en/docs/tweets/data-dictionary/overview/user-object */
				/* Typically a maximum of 15 characters long, but some historical accounts may exist with longer names*/
				type: Sequelize.STRING(32),
				allowNull: true
			},
			Twitter_user_description: {
				type: Sequelize.STRING(256),
				allowNull: true
			},
			Twitter_user_verified: {
				type: Sequelize.BOOLEAN,
				defaultValue: false,
			},
			Twitter_user_followers_count: {
				type: Sequelize.INTEGER,
				defaultValue: 0,
			},
			Twitter_user_friends_count: {
				type: Sequelize.INTEGER,
				defaultValue: 0,
			},
			Twitter_user_created_at: {
				type: Sequelize.DATE,
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
		return queryInterface.dropTable('Block')
	}
}
