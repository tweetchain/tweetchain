const Twitter = require('twitter');
const request = require("request");

export default class TwitterService {
	constructor() {
		this.key = process.env.TWITTER_CONSUMER_KEY;
		this.secret = process.env.TWITTER_CONSUMER_SECRET;
		this.bearer_token = null;

		this.client = null;

		this.genesis_tweet_id = '928712955847262208';
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
			const cat = key +":"+secret;
			const credentials = new Buffer(cat).toString('base64');
			const url = 'https://api.twitter.com/oauth2/token';

			request({
				url: url,
				method:'POST',
				headers: {
					"Authorization": "Basic " + credentials,
					"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"
				},
				body: "grant_type=client_credentials"
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
			qs:{"screen_name":"stadolf"},
			json:true,
			headers: {
				"Authorization": "Bearer " + bearerToken
			}
		}, (err, resp, body) => {
			console.dir(body);
		});
	}

	async getHashtagged(hashtag, cursor) {
		return new Promise((resolve, reject) => {
			this.client.get('search/tweets', {
				q: '#'+hashtag,
				count: 100,
			}, (error, tweets, response) => {
				if(!error)
					resolve(tweets);
				else
					reject(error);
			});
		});
	}
}
