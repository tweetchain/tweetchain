import db from '../db/models'
import TwitterService from './service/twitter';
import ValidationService from './service/validation';
import OTSService from './service/ots';

const twitter = new TwitterService();
const ots = new OTSService(db);
const validator = new ValidationService(db, twitter, ots);

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
	// application specific logging, throwing an error, or other logic here
});

let start = false;

const myArgs = process.argv.slice(2);
switch (myArgs[0]) {
	case 'start':
	case 's':
		start = myArgs[1];
		if(!start || !start.length || isNaN(start)) start = false;
		break;
	default:
		console.log('Sorry, that is not something I know how to do.');
}

db.sequelize.sync().then(() => {
	twitter.connect().then(() => {
		return validator.sync(start);
		return true;
	}).then(() => {
		// twitter.getTweets(['932550248567918592']).then(tweets => {
		// 	const moar_parents = [];
		// 	for(const tweet of tweets) {
		// 		if(tweet.in_reply_to_status_id_str) {
		// 			moar_parents.push(tweet.in_reply_to_status_id_str);
		// 	}
		// });
		return true;
	});
});
