import db from '../db/models'
import TwitterService from './service/twitter';
import ValidationService from './service/validation';
import OTSService from './service/ots';

const twitter = new TwitterService();
const ots = new OTSService(db);
const validator = new ValidationService(db, twitter, ots);

db.sequelize.sync().then(() => {
	twitter.connect().then(() => {
		return validator.sync();
	}).then(() => {
		// // twitter.getTweets(['932550019730890752']).then(console.log);
		// ots.submit(JSON.stringify({
		// 	mytestparam: 'some data',
		// 	anotherparam: 6,
		// 	onemore: true,
		// 	oklastone: false,
		// 	yeaimfullofit: [ 1, 2, ' 31231dada', true, true, false, ],
		// }))
	});
});
