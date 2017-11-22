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

	async sync(starting_tweet) {
		const tweets = await this.getAllTweets(starting_tweet);
		const blocks = tweets.map((tweet) => { return this.toBlock(tweet); });

		await this.storeBlocks(blocks);

		// Clean up
		while(await this.checkNonSequentialBlocks() || await this.checkNonConformingProtocol() || await this.setOrphans(PROTOCOL_LEGACY) || await this.setDeleted(PROTOCOL_LEGACY));
		while(await this.checkNonSequentialBlocks() || await this.checkNonConformingProtocol() || await this.setOrphans(PROTOCOL_STRICT100) || await this.setDeleted(PROTOCOL_STRICT100));

		// Submit outstanding OTS records
		await this.submitOTS();

		// Check if any have been upgraded
		await this.checkOTSConfirmations();
	}

	async getMissingParents(tweets, parent_key = 'quoted_status_id_str') {
		const already_stored = await this.BlockModel.findAll({
			where: {
				id: {
					[Sequelize.Op.in]: tweets.filter(tweet => { return tweet[parent_key]; }).map(tweet => { return tweet[parent_key]; }),
				},
			},
		});

		return tweets.filter((tweet) => {
			if(tweet.deleted) {
				// console.log(`Block not missing due to deleted`);
				return false;
			}

			// For top level genesis tweets
			if(!tweet[parent_key] || tweet[parent_key] === null || tweet[parent_key] === undefined) {
				// console.log(`Block not missing due to no tweet id`);
				return false;
			}

			if(tweets.some((parent_block) => {
				return parent_block.deleted || (parent_block.id_str === tweet[parent_key]);
			})) {
				// console.log(`Block not missing due to found in self`);
				return false;
			}

			// console.log(already_stored);
			if(already_stored.some(stored => { return stored.dataValues.id === tweet[parent_key] })) {
				// console.log(`Block not missing due to not found in database`);
				return false;
			}

			return true;
		});
	}

	async getAllTweets(starting_tweet) {
		let last_tweet = 0;

		if(starting_tweet) last_tweet = { dataValues: { id: starting_tweet, } };
		if(!last_tweet)
			last_tweet = await this.BlockModel.find({order: [['id', 'DESC']]});
		if(!last_tweet)
			last_tweet = { dataValues: { id: GENESIS_TWEET, } };

		console.log(`Using last tweet: ${last_tweet.dataValues.id}`);

		// Do we need initial sync?
		let alltweets = await this.getTaggedTweetsSince(last_tweet.dataValues.id);
		console.log('Total tagged tweets: ' + alltweets.length);
		console.log('===========================');

		while(true) {
			// Any missing parents?
			const missing_quote_parents = await this.getMissingParents(alltweets);
			const missing_reply_parents = await this.getMissingParents(alltweets, 'in_reply_to_status_id_str');
			if(!missing_quote_parents.length && !missing_reply_parents.length) break;

			// Determine the missing parents
			const missing_quote_ids = missing_quote_parents.map((tweet) => {	return tweet.quoted_status_id_str; });
			const missing_reply_ids = missing_reply_parents.map((tweet) => { return tweet.in_reply_to_status_id_str; });
			const unique_missing = Array.from(new Set(missing_quote_ids.concat(missing_reply_ids)));
			console.log('Missing parents: ' + unique_missing.length);
			console.log(JSON.stringify(unique_missing));

			// Download the missing parents
			const moar_tweets = await this.twitter.getTweets(Array.from(unique_missing));
			console.log('Downloaded parents: ' + moar_tweets.length);
			console.log(JSON.stringify(moar_tweets.map(t => { return t.id_str })));

			// Add stubs for deleted, missing parents
			if(moar_tweets.length !== unique_missing.length) {
				// Only add stubs for parents which we dont already have actual records for
				const parents_deleted = unique_missing.filter((parent_id) => {
					return !moar_tweets.some((tweet) => { return tweet.id_str === parent_id; });
				});

				for(const curparent of parents_deleted) {
					const phantom = {
						id_str: curparent,
						quoted_status_id_str: null,
						deleted: true,
					};
					moar_tweets.push(phantom);
				}

				console.log('Parent tweets have since been deleted: ', parents_deleted.length);
				console.log(JSON.stringify(parents_deleted));
			}

			Array.prototype.push.apply(alltweets, moar_tweets);
			console.log('Total tweets: ' + alltweets.length);
			console.log('===========================');
		}

		// Order the missing data so we can insert it properly.
		alltweets.sort((first, second) => {
			// console.log(first, second);
			return (new BigNumber(first.id_str).lt(new BigNumber(second.id_str)) ? -1 : 1);
		});

		return alltweets;
	}

	toStandardTweet(tweet) {
		return {
			id_str: tweet.id_str,
			full_text: tweet.full_text,
			retweet_count: tweet.retweet_count || 0,
			favorite_count: tweet.favorite_count || 0,
			created_at: tweet.created_at,
			user: (!tweet.user ? null : {
				id_str: tweet.user.id_str,
				name: tweet.user.name,
				screen_name: tweet.user.screen_name,
				description: tweet.user.description,
				verified: tweet.user.verified,
				created_at: tweet.user.created_at,
			}),
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
			in_reply_to_status_id_str: tweet.in_reply_to_status_id_str,
			deleted: tweet.deleted,
		};
	}

	toBlock(tweet) {
		const stdtweet = this.toStandardTweet(tweet);

		const text = this.getText(stdtweet);
		const block_number = this.getBlockNumber(text);
		const protocol = this.getProtocol(text);
		const genesis = (block_number === '0');
		const valid = this.extract(stdtweet, protocol, genesis);

		return {
			id: stdtweet.id_str,
			Block_id: stdtweet.quoted_status_id_str,
			protocol: protocol,
			block_number: block_number,
			text: stdtweet.full_text,
			orphaned: stdtweet.deleted || !valid || (!genesis && !Boolean(stdtweet.quoted_status_id_str)),
			deleted: stdtweet.deleted,
			Twitter_created_at: stdtweet.created_at,
			Twitter_retweet_count: stdtweet.retweet_count,
			Twitter_favorite_count: stdtweet.favorite_count,
			Twitter_user_id: (stdtweet.user ? stdtweet.user.id_str : null),
			Twitter_user_name: (stdtweet.user ? stdtweet.user.name : null),
			Twitter_user_screen_name: (stdtweet.user ? stdtweet.user.screen_name : null),
			Twitter_user_description: (stdtweet.user ? stdtweet.user.description : null),
			Twitter_user_verified: (stdtweet.user ? stdtweet.user.verified : null),
			// Twitter_user_followers_count: stdtweet.user.followers_count,
			// Twitter_user_friends_count: stdtweet.user.friends_count,
			Twitter_user_created_at: (stdtweet.user ? stdtweet.user.created_at : null),
		};
	}

	async getTaggedTweetsSince(last_tweet) {
		return (await this.twitter.getHashtagged('twittercoin', last_tweet)).statuses;
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

	async submitOTS() {
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
				[Sequelize.Op.or]: [
					{ upgraded_ots: null },
					{ upgraded_ots: { [Sequelize.Op.eq]: Sequelize.col('ots')} },
				],
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
			// include: [
			// 	{
			// 		model: this.BlockModel,
			// 		as: 'descendents',
			// 		hierarchy: true,
			// 	},
			// ],
		});

		if(!last_block) return [];

		const start_orphaned = last_block.orphaned;
		const flat_blocks = [];
		let counter = 0;
		do {
			last_block.ots = await this.OTSModel.find({
				where: { Block_id: last_block.id, },
				order: [
					[ 'created_at', 'DESC'],
				],
			});

			if(counter++ >= start)
				flat_blocks.push(last_block);
		} while((flat_blocks.length < count)
			&& ( last_block = await last_block.getParent() )
			&& ( last_block.orphaned === start_orphaned ));

		return flat_blocks.map(block => {
			// console.log(block);
			if(block.ots) {
				block.dataValues.upgraded_ots = block.ots.upgraded_ots;
				block.dataValues.ots = block.ots.ots;
			}
			return block.dataValues;
		});
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
