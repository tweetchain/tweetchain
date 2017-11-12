const Sequelize = require('sequelize');
const Sequelize_opts = require('../../config/db.json');

const GENESIS_TWEET = '928712955847262208';
const CONFIRMATION_COUNT = 10;

const PROTOCOL_LEGACY = 1;
const PROTOCOL_FUZZY = 2;

export default class ValidationService {
	constructor(db, twitter) {
		this.BlockModel = db.Block;
		this.twitter = twitter;
	}

	async init() {
		const lastblock = (await this.BlockModel.max('id') || GENESIS_TWEET)
		console.log(`Last tweet is ${lastblock}`);

		// Only gets tweets with #TwitterCoin
		await this.storeTaggedBlocksSince(lastblock);
		while(await this.storeUntaggedBlocks() || await this.checkOrphanedBlocks());
		// Now remove non-sequential blocks
		while(await this.checkNonSequentialBlocks() || await this.checkOrphanedBlocks());

	}

	async storeTaggedBlocksSince(lastblock) {
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

	async storeUntaggedBlocks() {
		// Get the rest that have been quoted tweet ids that had no hashtag
		const missing = await this.getMissingBlocks();
		console.log(`Downloading ${missing.length} missing blocks`);

		// Download said missing tweets
		const missing_tweets = await this.twitter.getTweets(JSON.parse(JSON.stringify(missing)));
		console.log(`Downloaded ${missing_tweets.length} missing blocks`);

		// Build the list of missing tweets that havent been orphaned
		const not_orphaned = missing_tweets.filter(maybeorphaned => {
					return !missing.some((tweet) => { tweet === maybeorphaned.id_str });
				});

		// console.log(not_orphaned);
		if(!not_orphaned.length) return false;

		const orphaned = [];
		for(const t of not_orphaned) {
			if(!await this.store(t)) {
				orphaned.push(t.id_str);
			}
		}

		console.log(`${orphaned.length} missing tweets invalid`);
		await this.checkOrphanedBlocks(orphaned);

		return true;
	}

	async checkOrphanedBlocks(orphaners = []) {
		// Get the rest that have been quoted tweet ids that had no hashtag
		const missing = await this.getMissingBlocks();
		console.log(`Downloading ${missing.length} missing blocks`);

		// Download said missing tweets
		const missing_tweets = await this.twitter.getTweets(JSON.parse(JSON.stringify(missing)));
		console.log(`Downloaded ${missing_tweets.length} missing blocks`);

		// Add the list of orphaners (tweets that no longer exists)
		Array.prototype.push.apply(orphaners, missing.filter(maybeorphaned => {
			return !missing_tweets.some((tweet) => { tweet.id_str === maybeorphaned });
		}));

		if(!orphaners.length) return false;

		let total_orphans = 0;
		while(orphaners.length) {
			// Set all the blocks affected by orphaners to orphaned
			await this.BlockModel.findAll({
					where: {
						Block_id: {
							[Sequelize.Op.in]: orphaners,
						},
						orphaned: false,
					}
				}).then(async blocks => {
					orphaners = [];
					total_orphans  += blocks.length;

					for(const block of blocks) {
						await block.update({
							orphaned: true,
						});

						// Add these blocks to orphaners and proceed to orphan their children!
						orphaners.push(block.dataValues.id);
					}
				});
		}

		console.log(JSON.stringify(orphaners));
		console.log(`${orphaners.length} blocks have been deleted, marked resulting orphans`);

		return true;
	}

	async checkNonSequentialBlocks() {
		const nonsequential = await this.BlockModel.findAll({
			where: {
				confirmed: false,
				orphaned: false,
				parent: Sequelize.literal('parent.block_number != Block.block_number - 1'),
			},
			order: [ ['block_number', 'desc'] ],
			include: [
				{ model: this.BlockModel, as: 'parent', },
			],
		}).map(async block => {
			await block.update({
				orphaned: true,
			});
			return block.dataValues.Block_id;
		});

		// Return unique results
		return Array.from(new Set(nonsequential)).length;
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
				block_number: {
					[Sequelize.Op.gt]: 0,
				},
				parent: Sequelize.literal('parent.id IS NULL'),
			},
			order: [ ['block_number', 'desc'] ],
			include: [
				{ model: this.BlockModel, as: 'parent', },
			],
		}).map(block => {
			return block.dataValues.Block_id;
		});

		// Return unique results
		return Array.from(new Set(missing_blocks));
	}

	async getLatestTweet() {
		return new Promise(async (resolve, reject) => {
			this.BlockModel.findAll({
					where: {
						orphaned: false,
					},
					order: [
						['block_number', 'DESC']
					],
					limit: 1,
				}).then(blocks => {
					resolve(blocks[0].dataValues);
				}).catch(error => { reject(error); });
			});
	}

	async store(tweet) {
		const text = this.getText(tweet);
		const block_number = this.getBlockNumber(text);
		const protocol = this.getSignaling(text);
		const genesis = (block_number === '0');

		if(!this.extract(tweet, protocol, genesis)) return false;

		const data = {
			Block_id: tweet.quoted_status_id_str,
			Tweeter_id: tweet.user.id_str,
			protocol: protocol,
			block_number: block_number,
			text: tweet.full_text,
			orphaned: (!genesis && !Boolean(tweet.quoted_status_id_str)),
		};

		if(!await this.BlockModel.findOrCreate({
			where: {
				id: tweet.id_str,
			},
			defaults: data,
		}).spread((record, created) => {
			console.log(`Record ${record.id} created == ${created}, ${this.twitter.getLink(tweet)}`);
		}).then(async () => {
			// If this is a quoted tweet and said tweet is included, add it too
			if(tweet.quoted_status_id_str
					&& tweet.quoted_status
					&& !await this.store(tweet.quoted_status)) {
				return false; // return so that this counts as invalid
			}

			return true;
		}).catch(error => {
			console.error('Error: ', error, tweet);
		})) return false;

		return true;
	}

	extract(tweet, protocol = this.getSignaling(this.getText(tweet)), genesis = false) {
		if(!genesis && (!tweet.is_quote_status || /^RT @[^:]{1,}:/.test(this.getText(tweet)))) {
			console.log(`Tweet is not a quote - ${this.twitter.getLink(tweet)}`);
			return;
		}

		if(protocol) return tweet;

		console.log(`Invalid protocol - ${this.twitter.getLink(tweet)}`);
		return;
	}

	getSignaling(status) {
		let protocol = 0;

		if(/[0-9]{1,}\//.test(status)) protocol |= PROTOCOL_LEGACY;
		if(/\/[0-9]{1,}/.test(status)) protocol |= PROTOCOL_FUZZY;

		return protocol;
	}

	getBlockNumber(status, signal = this.getSignaling(status)) {
		if(signal & PROTOCOL_LEGACY)
			return /([0-9]{1,})\//.exec(status)[1];

		if(signal & PROTOCOL_FUZZY)
			return /\/([0-9]{1,})/.exec(status)[1];

		return false;
	}

	// Remove the link to the quoted text so it doesn't get matched as a block
	getText(tweet) {
		return tweet.full_text
						.split(' ')
						.slice(0,-1)
						.join(' ');
	}
}
