import db from '../db/models'
import TwitterService from './service/twitter';
import ValidationService from './service/validation';

const twitter = new TwitterService();
const validator = new ValidationService(db, twitter);

const express = require('express');
const app = express();

app.get('/', function (req, res) {
	res.send('Hello World!');
});

app.listen(8000, function () {
	console.log('Example app listening on port 8000!');
});

db.sequelize.sync().then(() => {
	twitter.connect().then(() => {
		return validator.init();
	});
});
