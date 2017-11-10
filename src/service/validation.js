const Sequelize = require('sequelize');
const Sequelize_opts = require('../../db/config.json')
const Block = require('../../db/models/block.js')

export default class ValidationService {
	constructor(db) {
		this.BlockModel = db.Block;
	}

	async checkTweet(tweet_id) {
		const tweets = await this.BlockModel.findAll({where: { id: tweet_id, }});

		if(tweets.length) {
			console.log(tweets);
		}
	}
}
