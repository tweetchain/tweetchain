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
		// return validator.sync();
		return true;
	});
}).then(() => {
	app.get('/', (req, res) => {
		res.send(JSON.stringify({
			error: 'Invalid endpoint',
		}));
	});

	app.get('/getlatest', (req, res) => {
		const protocol = req.query.protocol || 'legacy';
		const count = req.query.count || 100;
		const start = req.query.start || 0;
		validator.getLatestBlocks(protocol, count, start).then(tweet => {
			res.send(JSON.stringify(tweet));
		});
	});

	app.get('/getblock', (req, res) => {
		const count = req.query.count || 100;
		const start = req.query.start || 0;
		const block_id = req.query.id || null;
		validator.getBlocksFrom(block_id, count, start).then(tweet => {
			res.send(JSON.stringify(tweet));
		});
	});

	app.get('/getstoredids', (req, res) => {
		db.Block.findAll({
				where: {
					orphaned: false,
					deleted: false,
				}
			}).then(results => {
				res.send(results.reduce((accum, block) => {
					return accum + `${block.dataValues.id}\n`;
				}, ''));
			});
	});

	app.get('/getstoredlinks', (req, res) => {
		db.Block.findAll({
				where: {
					orphaned: false,
					deleted: false,
				}
			}).then(results => {
				res.send(results.reduce((accum, block) => {
					return accum + `https://twitter.com/statuses/${block.dataValues.id}/\n`;
				}, ''));
			});
	});

	https.createServer(ssl_options, app).listen(8443, function () {
		console.log('Example app listening on port 8443!');
	});
});
