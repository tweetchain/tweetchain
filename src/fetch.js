import db from '../db/models'
import TwitterService from './service/twitter';
import ValidationService from './service/validation';

const twitter = new TwitterService();
const validator = new ValidationService(db, twitter);

db.sequelize.sync().then(() => {
	twitter.connect().then(() => {
		return validator.sync();
	}).then(async () => {
		// Do some tests?
		console.log('Fetching done, doing other stuffs...');
		// console.log((await validator.getTopUserBalances()).map(record => { record.balance = record.balance.toString(); return record; }));
		// console.log((await validator.getUserBalance('dafky2000')).toString())
	});
});
