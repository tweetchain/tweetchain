const config = require('config');
const BigNumber = require('bignumber.js');
const request = require('request');

const Twitter = require('twitter');

const TWITTER_CFG = config.get('twitter')
const TWITTER_SEARCH_TWEETS_COUNT = 100;

export default class TwitterService {
	constructor() {
		this.key = TWITTER_CFG['api_key'];
		this.secret = TWITTER_CFG['api_secret'];
		this.bearer_token = null;

		this.client = null;
	}

	async connect() {
		return new Promise(async (resolve, reject) => {
			if(!this.bearer_token)
				this.bearer_token = JSON.parse(await this.createBearerToken(this.key, this.secret)).access_token;

			this.client = new Twitter({
				consumer_key: this.key,
				consumer_secret: this.secret,
				bearer_token: this.bearer_token,
			})

			resolve();
		})
	}

	// Courtesy of https://gist.github.com/elmariachi111/6168585
	async createBearerToken(key, secret) {
		return new Promise((resolve, reject) => {
			const cat = key +':'+secret;
			const credentials = new Buffer(cat).toString('base64');
			const url = 'https://api.twitter.com/oauth2/token';

			request({
				url: url,
				method:'POST',
				headers: {
					'Authorization': 'Basic ' + credentials,
					'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'
				},
				body: 'grant_type=client_credentials'
			}, (err, resp, body) => {
				resolve(body);
			});
		});
	}

	// Courtesy of https://gist.github.com/elmariachi111/6168585
	async testBearerToken(token) {
		var url = 'https://api.twitter.com/1.1/statuses/user_timeline.json';
		var bearerToken = process.env.TWITTER_BEARER_TOKEN; //the bearer token obtained from the last script

		request({
			url: url,
			method:'GET',
			qs:{'screen_name':'stadolf'},
			json:true,
			headers: {
				'Authorization': 'Bearer ' + bearerToken
			}
		}, (err, resp, body) => {
			console.dir(body);
		});
	}

	async getHashtagged(hashtag, since_id = '0', max_id) {
		const params = {
			q: '#'+hashtag,
			count: TWITTER_SEARCH_TWEETS_COUNT,
			tweet_mode: 'extended',
		};
		if(!max_id) params.since_id = since_id;
		else params.max_id = max_id;

		return new Promise((resolve, reject) => {
			this.client.get('search/tweets', params, (error, tweets, response) => {
				if(error)	return reject(error);

				// Nothing to store
				if(!tweets.statuses || !tweets.statuses.length) {
					return resolve(tweets);
				}

				// Get the lowest id in this set
				const min_id_str = BigNumber.min(tweets.statuses.map((tweet) => { return new BigNumber(tweet.id_str); }));

				// If there are more results, get 'em.
				if(tweets.statuses.length === TWITTER_SEARCH_TWEETS_COUNT
						&& min_id_str.toString() !== max_id) {
					return this.getHashtagged(hashtag, since_id, min_id_str.toString())
						.then(moar_tweets => {
							tweets.statuses = tweets.statuses.concat(moar_tweets.statuses);
							return resolve(tweets);
						});
				} else {
					return resolve(tweets);
				}
			});
		});
	}

	async getTweets(tweet_id_str = []) {
		const to_submit = tweet_id_str.splice(0, 100);
		const params = {
			id: to_submit.join(','),
			tweet_mode: 'extended',
		};

		return new Promise((resolve, reject) => {
			this.client.get('statuses/lookup', params, (error, tweets, response) => {
				if(error)	return reject(error);

				// If there are more results, get 'em.
				if(tweet_id_str.length) {
					return this.getTweets(tweet_id_str)
						.then(moar_tweets => {
							tweets.statuses = tweets.statuses.concat(moar_tweets.statuses);
							return resolve(tweets);
						});
				} else {
					return resolve(tweets);
				}
			});
		});
	}

	getLink(tweet) {
		return `https://twitter.com/${tweet.user.id_str}/status/${tweet.id_str}`;
	}
}