import db from '../db/models'
import TwitterService from './service/twitter';
import ValidationService from './service/validation';

const twitter = new TwitterService();
const validator = new ValidationService(db, twitter);

const express = require('express');
const https = require('https');
const fs = require('fs');
const app = express();

/*
 * Generate SSL certificate
 * openssl genrsa -out server.key 2048
 * openssl req -new -key server.key -out server.csr
 * openssl x509 -req -days 366 -in server.csr -signkey server.key -out server.crt
 */
const ssl_options = {
	key: fs.readFileSync('server.key'),
	cert: fs.readFileSync('server.crt')
};

db.sequelize.sync().then(() => {
	twitter.connect().then(() => {
		return validator.init();
	});
}).then(() => {
	app.get('/', (req, res) => {
		res.send(JSON.stringify({
			error: 'Invalid endpoint',
		}));
	});

	app.get('/getlatest', (req, res) => {
		validator.getLatestTweet().then(tweet => {
			res.send(JSON.stringify(tweet));
		});
	});

	https.createServer(ssl_options, app).listen(8443, function () {
		console.log('Example app listening on port 8443!');
	});
});
