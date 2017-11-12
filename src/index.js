import db from '../db/models'
import TwitterService from './service/twitter';
import ValidationService from './service/validation';

const twitter = new TwitterService();
const validator = new ValidationService(db, twitter);

const express = require('express');
const app = express();

db.sequelize.sync().then(() => {
	twitter.connect().then(() => {
		return validator.init();
	});
}).then(() => {
	app.get('/', (req, res) => {
		const html = `<!DOCTYPE html>
			<html>
				<head>
					<title>TweetChain.info</title>
					<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js"></script>
					<script>window.twttr = (function(d, s, id) {
						var js, fjs = d.getElementsByTagName(s)[0],
							t = window.twttr || {};
						if (d.getElementById(id)) return t;
						js = d.createElement(s);
						js.id = id;
						js.src = "https://platform.twitter.com/widgets.js";
						fjs.parentNode.insertBefore(js, fjs);

						t._e = [];
						t.ready = function(f) {
							t._e.push(f);
						};

						return t;
					}(document, "script", "twitter-wjs"));</script>
				</head>
				<body>
					<h1>Welcome to TweetChain.info</h1>
					<p>It appears the longest valid chain ends here: </p>
					<div id="latest_tweet"></div>
					<script type="text/javascript">
						twttr.ready(function() {
								jQuery.getJSON('/getlatest', {}, function(data) {
										twttr.widgets.createTweet(
											data.id,
											document.getElementById('latest_tweet'),
											{
												theme: 'light'
											}
										);
									});
							});
					</script>

				</body>
			</html>
		`;
		res.send(html);
	});

	app.get('/getlatest', (req, res) => {
		validator.getLatestTweet().then(tweet => {
			res.send(JSON.stringify(tweet));
		});
	});

	app.listen(8000, function () {
		console.log('Example app listening on port 8000!');
	});
});
