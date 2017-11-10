import db from '../db/models'
import TwitterService from './service/twitter';
import ValidationService from './service/validation';

const twitter = new TwitterService();
const validator = new ValidationService(db);

const express = require('express');
const app = express();

app.get('/', function (req, res) {
	res.send('Hello World!');
});

app.listen(8000, function () {
	console.log('Example app listening on port 8000!');
});

db.sequelize.sync().then(() => {
	twitter.connect()
		.then(() => {
			return twitter.getHashtagged('twittercoin');
		}).then((tweets) => {
			for(const t of tweets.statuses) {
				if(t.is_quote_status
						&& (/[0-9]{1,}\//.test(t.text) || /\/[0-9]{1,}/.test(t.text))) {
					console.log(t.text);
					// validator.checkTweet(t.id_str);
				}
			}
		}).catch(error => {
			console.error(error);
		});
});
