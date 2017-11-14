import db from '../db/models'
import TwitterService from './service/twitter';
import ValidationService from './service/validation';

const twitter = new TwitterService();
const validator = new ValidationService(db, twitter);

const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');

const app = express();
// Only if we aren't running production!!
if(process.env.NODE_ENV !== 'production') {
	app.use(cors());
}

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
	}).then(() => {
		validator.getLatestBlocks();
	});
}).then(() => {
	app.get('/', (req, res) => {
		res.send(JSON.stringify({
			error: 'Invalid endpoint',
		}));
	});

	app.get('/getlatest', (req, res) => {
		const count = req.query.count || 1;
		const start = req.query.start || 0;
		validator.getLatestBlocks(count, start).then(tweet => {
			res.send(JSON.stringify(tweet));
		});
	});

	// app.get('/getblocks', (req, res) => {
	// 	const block_number = req.query.block_number || null;
	// 	console.log(block_number);
	// 	// validator.getLatestBlocks(count, start).then(tweet => {
	// 	// 	res.send(JSON.stringify(tweet));
	// 	// });
	// });

	https.createServer(ssl_options, app).listen(8443, function () {
		console.log('Example app listening on port 8443!');
	});
});
