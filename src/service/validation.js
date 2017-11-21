const BigNumber = require('bignumber.js')
const Sequelize = require('sequelize');
const Sequelize_opts = require('../../config/db.json');
require('sequelize-hierarchy')(Sequelize);

const GENESIS_TWEET = '928712955847262208';
const CONFIRMATION_COUNT = 10;

const PROTOCOL_LEGACY = 1;
const PROTOCOL_STRICT100 = 2;

export default class ValidationService {
	constructor(db, twitter, ots) {
		this.BlockModel = db.Block;
		this.OTSModel = db.OTS;
		this.twitter = twitter;
		this.ots = ots;
	}

	async sync() {
		let lastblock = await this.BlockModel.find({
			order: [
				['id', 'DESC'],
			],
		}) || { dataValues: { id: GENESIS_TWEET, } };

		// if(!lastblock)
		// 	lastblock = ;

		console.log(`Last tweet is ${lastblock.dataValues.id}`);

		// Do we need initial sync?
		let alltweets = await this.getTaggedTweetsSince(lastblock.dataValues.id);
		let allblocks = alltweets.map((tweet) => {
			return this.toBlock(tweet);
		});

		console.log('Total valid blocks: ' + allblocks.length);
		console.log('===========================');

		const _get_w_no_parent = async blocks => {
			const already_stored = await this.BlockModel.findAll({
				where: {
					id: {
						[Sequelize.Op.in]: blocks.filter(block => { return block.Block_id; }).map(block => { return block.Block_id; }),
					},
				},
			});

			return blocks.filter((block) => {
				if(block.deleted) {
					// console.log(`Block not missing due to deleted`);
					return false;
				}

				// For top level genesis blocks
				if(!block.Block_id) {
					// console.log(`Block not missing due to no block id`);
					return false;
				}

				if(blocks.some((parent_block) => {
					return parent_block.deleted || (parent_block.id === block.Block_id);
				})) {
					// console.log(`Block not missing due to found in self`);
					return false;
				}

				// console.log(already_stored);
				if(already_stored.some(stored => { return stored.dataValues.id === block.Block_id })) {
					// console.log(`Block not missing due to not found in database`);
					return false;
				}

				return true;
			});
		};

		let missing = await _get_w_no_parent(allblocks);
		while(missing.length) {
			console.log('Missing parents: ' + missing.length);

			const unique_missing = Array.from(new Set(missing.map((block) => { return block.Block_id; })));
			console.log('Unique missing parents: ' + unique_missing.length);
			console.log(unique_missing);

			const moar_tweets = await this.twitter.getTweets(Array.from(unique_missing));
			const moar_tweet_blocks = moar_tweets.map((tweet) => {
				return this.toBlock(tweet);
			});
			console.log('Downloaded parents: ' + moar_tweet_blocks.length);

			// console.log(missing);
			// console.log(moar_tweet_blocks);

			// If we haven't retrieved the same number of tweets as we had unique_missing than some have been deleted, we should mark those as orphaned
			if(moar_tweet_blocks.length !== unique_missing.length) {
				const parents_deleted = unique_missing.filter((parent_id) => {
					return !moar_tweet_blocks.some((tweet) => { return tweet.id === parent_id; });
				});

				for(const curparent of parents_deleted) {
					const phantom = {
						id: curparent,
						Block_id: null,
						text: '',
						protocol: 0,
						block_number: 0,
						deleted: true,
						orphaned: false,
					};
					moar_tweet_blocks.push(phantom);
				}

				console.log('Parent blocks have since been deleted: ', JSON.stringify(parents_deleted));
			}

			Array.prototype.push.apply(alltweets, moar_tweets);
			Array.prototype.push.apply(allblocks, moar_tweet_blocks);
			console.log('Total tweets: ' + alltweets.length);
			console.log('Total blocks: ' + allblocks.length);
			console.log('===========================');

			// Any more missing parents?
			missing = await _get_w_no_parent(allblocks);
		}

		// Order the missing data so we can insert it properly.
		const ordered_tweets = alltweets.sort((first, second) => {
			return (new BigNumber(first.id_str).lt(new BigNumber(second.id_str)) ? -1 : 1);
		});

		// Order the missing data so we can insert it properly.
		const ordered_blocks = allblocks.sort((first, second) => {
			return (new BigNumber(first.id).lt(new BigNumber(second.id)) ? -1 : 1);
		});

		// console.log('===================================================================');
		// console.log('===================================================================');
		// console.log('===================================================================');
		// console.log(JSON.stringify(ordered_tweets));
		// console.log('===================================================================');
		// console.log('===================================================================');
		// console.log('===================================================================');

		await this.storeBlocks(ordered_blocks);

		// console.log(JSON.stringify(ordered_data.map(block => { return block.id_str; })));

		// Clean up
		// while(await this.checkNonSequentialBlocks() || await this.checkNonConformingProtocol() || await this.setOrphans(PROTOCOL_LEGACY) || await this.setDeleted(PROTOCOL_LEGACY));
		// while(await this.checkNonSequentialBlocks() || await this.checkNonConformingProtocol() || await this.setOrphans(PROTOCOL_STRICT100) || await this.setDeleted(PROTOCOL_STRICT100));

		// Submit outstanding OTS records
		// await this.checkOTS();
		// Check if any have been upgraded
		await this.checkOTSConfirmations();
	}

	toStandardTweet(tweet) {
		return {
			id_str: tweet.id_str,
			full_text: tweet.full_text,
			retweet_count: tweet.retweet_count,
			favorite_count: tweet.favorite_count,
			created_at: tweet.created_at,
			user: {
				id_str: tweet.user.id_str,
				name: tweet.user.name,
				screen_name: tweet.user.screen_name,
				description: tweet.user.description,
				verified: tweet.user.verified,
				created_at: tweet.user.created_at,
			},
			is_quote_status: tweet.is_quote_status,
			quoted_status_id_str: tweet.quoted_status_id_str,
			quoted_status: (!tweet.is_quote_status || !tweet.quoted_status ? null : {
				id_str: tweet.quoted_status.id_str,
				full_text: tweet.quoted_status.full_text,
				retweet_count: tweet.quoted_status.retweet_count,
				favorite_count: tweet.quoted_status.favorite_count,
				created_at: tweet.quoted_status.created_at,
				user: {
					id_str: tweet.quoted_status.user.id_str,
					name: tweet.quoted_status.user.name,
					screen_name: tweet.quoted_status.user.screen_name,
					description: tweet.quoted_status.user.description,
					verified: tweet.quoted_status.user.verified,
					created_at: tweet.quoted_status.user.created_at,
				},
				is_quote_status: tweet.is_quote_status,
				quoted_status_id_str: tweet.quoted_status_id_str,
			}),
		};
	}

	toBlock(tweet) {
		tweet = this.toStandardTweet(tweet);

		const text = this.getText(tweet);
		const block_number = this.getBlockNumber(text);
		const protocol = this.getProtocol(text);
		const genesis = (block_number === '0');
		const valid = this.extract(tweet, protocol, genesis);

		return {
			id: tweet.id_str,
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
			// Twitter_user_followers_count: tweet.user.followers_count,
			// Twitter_user_friends_count: tweet.user.friends_count,
			Twitter_user_created_at: tweet.user.created_at,
		};
	}

	async getTaggedTweetsSince(lastblock) {
		return (await this.twitter.getHashtagged('twittercoin', lastblock)).statuses;
	}

	async setOrphans(protocol) {
		let orphans = await this.BlockModel.findAll({
			where: {
				[Sequelize.Op.or]: [
					// { Block_id: null },
					{ Twitter_user_id: null },
					// { block_number: 0, },
					{ orphaned: true, },
					{ deleted: true, },
					{ protocol: 0, },
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

	async setDeleted(protocol, count = 100) {
		let last_block = await this.BlockModel.find({
			where: {
				// protocol: this.getProtocolSelector(protocol),
				orphaned: false,
				deleted: false,
			},
			order: [
				['block_number', 'DESC'],
			],
			limit: 1,
		});

		if(!last_block) return false;

		const last100 = (await this.getBlocksFrom(last_block.id, count)).map(block => {
			return block.id;
		});

		const moar_tweets = await this.twitter.getTweets(last100);
		const moar_tweet_blocks = moar_tweets.map((tweet) => {
			return this.toBlock(tweet);
		}).filter(block => {
			return block.orphaned;
		});

		if(moar_tweet_blocks.length) {
			const deleted = last100.filter((block) => {
				return !moar_tweet_blocks.some((tweet) => { return tweet.id === block; });
			});

			const deleted_models = await this.BlockModel.findAll({
				where: {
					id: {
						[Sequelize.Op.in]: deleted,
					},
				},
			});

			for(const del of deleted_models) {
				await del.update({
					deleted: true,
				});
			}

			console.log(`${deleted.length} blocks deleted`);
			return true;
		}

		return false;
	}

	async checkNonSequentialBlocks(protocol) {
		const nonsequential = await this.BlockModel.findAll({
			where: {
				confirmed: false,
				orphaned: false,
				deleted: false,
				protocol: { [Sequelize.Op.gt]: 0 },
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

	async checkNonConformingProtocol() {
		const blocks = await this.BlockModel.findAll({
			where: {
				confirmed: false,
				orphaned: false,
				deleted: false,
				protocol: { [Sequelize.Op.gt]: 0 },
				block_number: { [Sequelize.Op.gt]: 100 },
				parent: Sequelize.literal('( parent.protocol & Block.protocol ) != Block.protocol'),
			},
			include: [
				{ model: this.BlockModel, as: 'parent', },
			],
		}).map(async block => {
			// console.log(block.dataValues.parent.dataValues.protocol, block.dataValues.protocol, ( block.dataValues.parent.dataValues.protocol & block.dataValues.protocol ));

			await block.update({
				protocol: ( block.dataValues.parent.dataValues.protocol & block.dataValues.protocol ),
			});

			return block.dataValues.Block_id;
		});

		if(blocks.length === 1) console.log(blocks);
		console.log(`${blocks.length} Invalid protocols`);
		return blocks.length;
	}

	async checkOTS() {
		const blocks = await this.BlockModel.findAll({
			where: {
				deleted: false,
				ots: Sequelize.literal('ots.ots IS NULL'),
			},
			include: [
				{ model: this.OTSModel, as: 'ots', },
			],
		});

		// console.log(blocks);
		console.log('Getting '+blocks.length+' tweets from blocks');
		const tweets = await this.twitter.getTweets(blocks.map(block => {
			return block.dataValues.id;
		}));
		tweets.sort((first, second) => {
			return (new BigNumber(first.id_str).lt(new BigNumber(second.id_str)) ? -1 : 1);
		});

		console.log('Submitting '+tweets.length+' tweets to OpenTimestamps');
		for(const tweet of tweets) {
			await this.ots.submit(JSON.stringify(this.toStandardTweet(tweet)), { Block_id: tweet.id_str, });
		}
	}

	async checkOTSConfirmations() {
		const ots_records = await this.OTSModel.findAll({
			where: {
				upgraded_ots: null,
			},
		}).map(async record => {
			return {
				Block_id: record.dataValues.Block_id,
				data: record.dataValues.data,
			};
		});

		console.log('Submitting '+ots_records.length+' tweets to OpenTimestamps for upgrade');
		for(const record of ots_records) {
			await this.ots.submit(record.data, { Block_id: record.Block_id, });
		}
	}

	async getLatestBlocks(protocol, count = 20, start = 0) {
		if(protocol === 'strict100') protocol = PROTOCOL_STRICT100;
		else protocol = PROTOCOL_LEGACY;

		let last_block = await this.BlockModel.find({
			where: {
				orphaned: false,
				deleted: false,
				protocol: this.getProtocolSelector(protocol),
			},
			order: [
				['block_number', 'DESC'],
			],
		});

		if(!last_block) return [];

		return this.getBlocksFrom(last_block.id, count, start);
	}

	async getBlocksFrom(id, count = 20, start = 0) {
		if(!id || !id.length) return [];

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
				hierarchy: true,
			},
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

	async storeBlocks(blocks) {
		console.log(`Got ${blocks.length} blocks for processing`);

		let invalid = 0;
		for(const t of blocks) {
			if(!await this.store(t)) {
				console.log(`Block ${t.id} invalid`);
				++invalid;
			}
		}

		console.log(`${invalid} blocks invalid`);
	}

	async store(block) {
		const data = await this.BlockModel.findOrCreate({
			where: {
				id: block.id,
			},
			defaults: block,
		}).catch((error) => { return false; });

		return data;
	}

	extract(tweet, protocol = this.getProtocol(this.getText(tweet)), genesis = false) {
		// console.log(tweet.deleted, protocol, genesis, tweet.is_quote_status, this.getText(tweet))

		if(tweet.deleted) return false;

		if(!genesis && (!tweet.is_quote_status || /^RT @[^:]{1,}:/.test(this.getText(tweet)))) {
			console.log(`Tweet is not a quote - ${this.twitter.getLink(tweet)}`);
			return false;
		}

		if(!protocol) {
			console.log(`Invalid protocol - ${this.twitter.getLink(tweet)}`);
			return false;
		}

		// console.log(`Tweet appears formatted correctly - ${this.twitter.getLink(tweet)}`);
		return tweet;
	}

	getProtocol(status) {
		if(/^[0-9]{1,}\/ #TwitterCoin @otsproofbot *\n *\n/i.test(status))
			return ( PROTOCOL_STRICT100 | PROTOCOL_LEGACY );
		if(/[0-9]{1,}\//.test(status))
			return PROTOCOL_LEGACY;
		if(/\/[0-9]{1,}/.test(status))
			return PROTOCOL_LEGACY;
	}

	getProtocolSelector(protocol) {
		if(protocol & PROTOCOL_STRICT100) {
			return Sequelize.literal('protocol & ' + PROTOCOL_STRICT100);
		}

		return PROTOCOL_LEGACY;
	}

	getBlockNumber(status, protocol = this.getProtocol(status)) {
		// console.log(protocol, status);
		if(protocol & PROTOCOL_LEGACY) {
			const tmp = /([0-9]{1,})\//.exec(status);
			if(tmp)	return tmp[1];

			return /\/([0-9]{1,})/.exec(status)[1];
		}

		if(protocol & PROTOCOL_STRICT100)
			return /^([0-9]{1,})\//.exec(status)[1];

		return null;
	}

	// Remove the link to the quoted text so it doesn't get matched as a block
	getText(tweet) {
		return tweet.full_text;
	}
}
