import db from '../db/models'
import TwitterService from './service/twitter';
import ValidationService from './service/validation';

const twitter = new TwitterService();
const validator = new ValidationService(db, twitter);

db.sequelize.sync().then(() => {
	twitter.connect().then(() => {
		return validator.sync();
	});
});
