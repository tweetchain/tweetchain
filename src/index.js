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

	app.get('/gettop10balances', (req, res) => {
		validator.getTopUserBalances().then(data => {
			res.send(JSON.stringify({
				balances: data.map(record => { return {
					Twitter_user_screen_name: record.Twitter_user_screen_name,
					balance: record.balance.toString(),
				};
			}),
			circulation: 0,
		}));
	});
});

app.get('/userbalance', (req, res) => {
		const user = req.query.user || null;
		if(user) {
			validator.getUserBalance(user).then(data => {
				res.send(JSON.stringify({
					balance: data.balance.toString(),
				}));
			});
		}
	});

	https.createServer(ssl_options, app).listen(8443, function () {
		console.log('Example app listening on port 8443!');
	});
});
