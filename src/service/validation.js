const Sequelize = require('sequelize');
const Sequelize_opts = require('../../config/db.json');

const GENESIS_TWEET = '928712955847262208';
const CONFIRMATION_COUNT = 10;

const PROTOCOL_LEGACY = 1;
const PROTOCOL_FUZZY = 2;
const PROTOCOL_HASHTAG = 4;

export default class ValidationService {
	constructor(db, twitter) {
		this.BlockModel = db.Block;
		this.twitter = twitter;
	}

	async init() {
		const lastblock = (await this.BlockModel.max('id') || GENESIS_TWEET)
		console.log(`Last tweet is ${lastblock}`);

		// Only gets tweets with #TwitterCoin
		await this.storeBlocksSince(lastblock);

		// Get the rest that have been quoted tweet ids that had no hashtag
		const missing = await this.getMissingBlocks();
		console.log(`Downloading ${missing.length} missing blocks`);

		// Download said missing tweets
		const missing_tweets = await this.twitter.getTweets(JSON.parse(JSON.stringify(missing)));
		console.log(`Downloaded ${missing_tweets.length} missing blocks`);

		// Build the list of orphaners (tweets that no longer exists)
		const orphaners = missing.filter(maybeorphaned => {
					return missing_tweets.some((tweet) => { tweet.id_str === maybeorphaned });
				});
		console.log(`${orphaners.length} blocks have been deleted`);

		// Build the list of missing tweets that havent been orphaned
		const not_orphaned = missing_tweets.filter(maybeorphaned => {
					return !missing.some((tweet) => { tweet === maybeorphaned.id_str });
				});

		let invalid = 0;
		for(const t of not_orphaned) {
			if(!await this.store(t)) {
				++invalid;
				orphaners.push(t.id_str);
			}
		}
		console.log(`${invalid} missing tweets invalid`);

		// Set all the blocks affected by orphaners to orphaned
		await this.BlockModel.findAll({
				where: {
					Block_id: {
						[Sequelize.Op.in]: orphaners,
					}
				}
			}).then(async blocks => {
				for(const block of blocks) {
					await block.update({
						orphaned: true,
					});
				}
			});
	}

	async storeBlocksSince(lastblock) {
		await this.twitter.getHashtagged('twittercoin', lastblock)
			.then(async (tweets) => {
				console.log(`Got ${tweets.statuses.length} tweets for processing`);

				let invalid = 0;
				for(const t of tweets.statuses) {
					if(!await this.store(t))
						++invalid;
				}

				console.log(`${invalid} tweets invalid`);
			}).catch(error => {
				console.error(error);
			});
	}

	async checkUnconfirmedBlocks(confirmations) {
		this.BlockModel.findAll({
			where: {
				confirmed: false,
				orphaned: false,
			},
			order: [ ['block_number', 'desc'] ],
			include: [
				{ model: this.BlockModel, as: 'children', },
				{ model: this.BlockModel, as: 'parent', },
			],
		}).then(unconfirmed => {
			for(const block of unconfirmed.map(block => { return block.dataValues; })) {
				console.log(block);
				console.log(block.parent);
			}
		});
	}

	async getMissingBlocks() {
		const missing_blocks = await this.BlockModel.findAll({
			where: {
				confirmed: false,
				orphaned: false,
				parent: Sequelize.literal('parent.id IS NULL'),
			},
			order: [ ['block_number', 'desc'] ],
			include: [
				{ model: this.BlockModel, as: 'children', },
				{ model: this.BlockModel, as: 'parent', },
			],
		}).map(block => {
			return block.dataValues.Block_id;
		});

		// Return unique results
		return Array.from(new Set(missing_blocks));
	}

	async store(tweet) {
		if(!this.extract(tweet)) return;

		const protocol = this.getSignaling(tweet.text);
		const block_number = this.getBlockNumber(tweet.text);

		const data = {
			Block_id: tweet.quoted_status_id_str,
			Tweeter_id: tweet.user.id_str,
			protocol: protocol,
			block_number: block_number,
			text: tweet.text,
			orphaned: !Boolean(tweet.quoted_status_id_str),
		};

		await this.BlockModel.findOrCreate({
			where: {
				id: tweet.id_str,
			},
			defaults: data,
		}).spread((record, created) => {
			console.log(`Record ${record.id} created == ${created}, ${this.twitter.getLink(tweet)}`);
		}).catch(error => {
			console.error('Error: ', error, tweet);
		});

		// If this is a quoted tweet and said tweet is included, add it too
		if(tweet.quoted_status_id_str && tweet.quoted_status) {
			if(!await this.store(tweet.quoted_status))
				return; // return so that this counts as invalid
		}
	}

	extract(tweet) {
		if(!tweet.is_quote_status) {
			console.log(`Tweet is not a quote - ${this.twitter.getLink(tweet)}`);
			return;
		}

		const protocol = this.getSignaling(tweet.text);
		if((protocol & PROTOCOL_LEGACY) || (protocol & PROTOCOL_FUZZY)) {
			return tweet;
		}

		console.log(`Invalid protocol - ${this.twitter.getLink(tweet)}`);
		return;
	}

	getSignaling(status) {
		let protocol = 0;

		if(/^[0-9]{1,}\//.test(status))
			protocol |= PROTOCOL_LEGACY;
		if(/^\/[0-9]{1,}/.test(status))
			protocol |= PROTOCOL_FUZZY;
		if(/#twittercoin/i.test(status))
			protocol |= PROTOCOL_HASHTAG;

		return protocol;
	}

	getBlockNumber(status, signal = this.getSignaling(status)) {
		if(signal & PROTOCOL_LEGACY)
			return /^([0-9]{1,})\//.exec(status)[1];

		if(signal & PROTOCOL_FUZZY)
			return /^\/([0-9]{1,})/.exec(status)[1];

		return false;
	}
}
