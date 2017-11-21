import db from '../db/models'
import TwitterService from './service/twitter';
import ValidationService from './service/validation';
import OTSService from './service/ots';

const twitter = new TwitterService();
const ots = new OTSService(db);
const validator = new ValidationService(db, twitter, ots);

try {
	db.sequelize.sync().then(() => {
		twitter.connect().then(() => {
			return validator.sync();
		}).then(() => {
			return true;
		});
	});
} catch(err) {
	console.log(err);
	console.trace('Here');
}
