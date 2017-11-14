const BigNumber = require('bignumber.js')
const Sequelize = require('sequelize');
const Sequelize_opts = require('../../config/db.json');
require('sequelize-hierarchy')(Sequelize);

const GENESIS_TWEET = '928712955847262208';
const CONFIRMATION_COUNT = 10;

const PROTOCOL_LEGACY = 1;
const PROTOCOL_FUZZY = 2;

export default class ValidationService {
	constructor(db, twitter) {
		this.BlockModel = db.Block;
		this.twitter = twitter;
	}

	async sync() {
		const lastblock = (await this.BlockModel.max('id') || GENESIS_TWEET)
		console.log(`Last tweet is ${lastblock}`);

		// Do we need initial sync?
		let allblocks = await this.getTaggedTweetsSince(lastblock);

		console.log('Total blocks: ' + allblocks.length);
		console.log('===========================');

		function _get_w_no_parent(blocks) {
			return blocks.filter((block) => {
				if(block.deleted) return false;

				if(!block.is_quote_status) return false;
				// For top level genesis blocks
				if(!block.quoted_status_id_str) return false;

				if(blocks.some((parent_block) => {
					return parent_block.id_str === block.quoted_status_id_str;
				})) {
					return false;
				} else {
					return true;
				}
			});
		}

		let missing = _get_w_no_parent(allblocks);
		while(missing.length) {
			console.log('Missing parents: ' + missing.length);

			// console.log(missing);

			const unique_missing = Array.from(new Set(missing.map((block) => { return block.quoted_status_id_str; })));
			console.log('Unique missing parents: ' + unique_missing.length);

			const moar_tweets = await this.twitter.getTweets(Array.from(unique_missing));
			console.log('Downloaded parents: ' + moar_tweets.length);

			// console.log(moar_tweets);

			// If we haven't retrieved the same number of tweets as we had unique_missing than some have been deleted, we should mark those as orphaned
			if(moar_tweets.length !== unique_missing.length) {
				const parents_deleted = unique_missing.filter((parent_id) => {
					return !moar_tweets.some((tweet) => { return tweet.id_str === parent_id; });
				});

				for(const curparent of parents_deleted) {
					const phantom = {
						id_str: curparent,
						quoted_status_id_str: null,
						is_quoted_status: true,
						full_text: '',
						deleted: true,
						orphaned: true,
						user: {
							id_str: null,
						},
					};
					moar_tweets.push(phantom);
				}

				console.log('Parent blocks have since been deleted: ', JSON.stringify(parents_deleted));
			}

			Array.prototype.push.apply(allblocks, moar_tweets);
			console.log('Total blocks: ' + allblocks.length);

			console.log('===========================');

			// Any more missing parents?
			missing = _get_w_no_parent(allblocks);
		}

		// Order the missing data so we can insert it properly.
		const ordered_blocks = allblocks.sort((first, second) => {
			return (new BigNumber(first.id_str).lt(second.id_str) ? -1 : 1);
		});

		await this.storeTweets(ordered_blocks);

		// console.log(JSON.stringify(ordered_data.map(block => { return block.id_str; })));

		// Clean up
		while(await this.checkNonSequentialBlocks() || await this.setOrphans());
	}

	async getTaggedTweetsSince(lastblock) {
		return await this.twitter.getHashtagged('twittercoin', lastblock)
			.then(async (tweets) => {
				console.log(`Got ${tweets.statuses.length} tweets for processing`);
				return tweets.statuses;
			}).catch(error => {
				console.error(error);
			});
	}

	async setOrphans() {
		let orphans = await this.BlockModel.findAll({
			where: {
				[Sequelize.Op.or]: [
					{ orphaned: true, },
					{ deleted: true, },
				]
			},
		}).map((block) => { return block.dataValues.id });

		while(orphans.length) {
			orphans = await this.BlockModel.findAll({
				where: {
					Block_id: {
						[Sequelize.Op.in]: orphans,
					},
					orphaned: false,
				},
			});

			for(const orphan of orphans) {
				await orphan.update({
					orphaned: true,
				});
			}

			orphans = orphans.map((block) => { return block.dataValues.id });
		}
	}

	async checkNonSequentialBlocks() {
		const nonsequential = await this.BlockModel.findAll({
			where: {
				confirmed: false,
				orphaned: false,
				deleted: false,
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

	async getLatestBlocks(count = 20, start = 0) {
		await this.sync();

		let last_block = await this.BlockModel.find({
			where: {
				orphaned: false,
				deleted: false,
			},
			order: [
				['block_number', 'DESC'],
			],
			limit: 1,
		});

		if(!last_block) return [];

		return this.getBlocksFrom(last_block.id, count, start);
	}

	async getBlocksFrom(id, count = 20, start = 0) {
		if(!id || !id.length) return [];

		await this.sync();

		let last_block = await this.BlockModel.find({
			where: {
				id: id,
			},
			order: [
				['block_number', 'DESC'],
			],
			include: {
				model: this.BlockModel,
				as: 'descendents',
				hierarchy: true
			},
			limit: 1,
		});

		if(!last_block) return [];

		const start_orphaned = last_block.orphaned;
		const flat_blocks = [];
		let counter = 0;
		do
			if(counter++ >= start)
				flat_blocks.push(last_block.dataValues);
		while((flat_blocks.length < count)
			&& ( last_block = await last_block.getParent() )
			&& ( last_block.orphaned === start_orphaned ));

		return flat_blocks;
	}

	async storeTweets(tweets) {
		console.log(`Got ${tweets.length} tweets for processing`);

		let invalid = 0;
		for(const t of tweets) {
			if(!await this.store(t))
				++invalid;
		}

		console.log(`${invalid} tweets invalid`);
	}

	async store(tweet) {
		const text = this.getText(tweet);
		const block_number = this.getBlockNumber(text);
		const protocol = this.getSignaling(text);
		const genesis = (block_number === '0');

		const valid = this.extract(tweet, protocol, genesis);

		const data = {
			Block_id: tweet.quoted_status_id_str,
			Twitter_user_id: tweet.user.id_str,
			protocol: protocol,
			block_number: block_number,
			text: tweet.full_text,
			orphaned: tweet.deleted || !valid || (!genesis && !Boolean(tweet.quoted_status_id_str)),
			deleted: tweet.deleted,
			Twitter_created_at: tweet.created_at,
			Twitter_retweet_count: tweet.retweet_count,
			Twitter_favorite_count: tweet.favorite_count,
			Twitter_user_name: tweet.user.name,
			Twitter_user_screen_name: tweet.user.screen_name,
			Twitter_user_description: tweet.user.description,
			Twitter_user_verified: tweet.user.verified,
			Twitter_user_followers_count: tweet.user.followers_count,
			Twitter_user_friends_count: tweet.user.friends_count,
			Twitter_user_created_at: tweet.user.created_at,
		};

		if(!await this.BlockModel.findOrCreate({
			where: {
				id: tweet.id_str,
			},
			defaults: data,
		}).spread((record, created) => {
			console.log(`Record ${record.id} created == ${created}, ${this.twitter.getLink(tweet)}`);
		}).then(async () => {
			// // If this is a quoted tweet and said tweet is included, add it too
			// if(tweet.quoted_status_id_str
			// 		&& tweet.quoted_status
			// 		&& !await this.store(tweet.quoted_status)) {
			// 	return false; // return so that this counts as invalid
			// }

			return true;
		}).catch(error => {
			console.error('Error: ', error, tweet);
		})) return false;

		return valid;
	}

	extract(tweet, protocol = this.getSignaling(this.getText(tweet)), genesis = false) {
		if(tweet.deleted) return false;

		if(!genesis && (!tweet.is_quote_status || /^RT @[^:]{1,}:/.test(this.getText(tweet)))) {
			console.log(`Tweet is not a quote - ${this.twitter.getLink(tweet)}`);
			return false;
		}

		if(protocol) return tweet;

		console.log(`Invalid protocol - ${this.twitter.getLink(tweet)}`);
		return false;
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
