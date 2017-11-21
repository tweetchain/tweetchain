const fs = require('fs');
const Sequelize = require('sequelize');
const Sequelize_opts = require('../../config/db.json');
const OpenTimestamps = require('javascript-opentimestamps');

export default class OTSService {
	constructor(db) {
		this.OTSModel = db.OTS;
	}

	async submit(data, extra = {}) {
		function d2h(d) {
			return ('0' + d.toString(16)).slice(-2);
		}

		const file = Buffer.from(data);
		const detached = OpenTimestamps.DetachedTimestampFile.fromBytes(new OpenTimestamps.Ops.OpSHA256(), file);
		const sha256 = detached.timestamp.msg.reduce((accum, point) => { return accum += d2h(point); }, '');

		const record = extra;
		record.sha256 = sha256;
		record.data = data;

		// console.log(record);

		return this.OTSModel.findOrCreate({
			where: {
				sha256: sha256,
			},
			defaults: record,
		}).spread((timestamp, created) => {
			// Stamp the message
			if(created || !timestamp.ots) {
				console.log('Timestamp doesn\'t exist, creating ' + sha256 + '...');

				return OpenTimestamps.stamp(detached).then(() => {
					console.log('Timestamp created, updating OTS signature.');
					return timestamp.update({
						ots: detached.serializeToBytes().reduce((accum, point) => { return accum += d2h(point); }, ''),
					});
				});
			} else {
				console.log('Timestamp ' + sha256 + ' exists.');

				// Check if this timestamp has been confirmed
				if(timestamp.upgraded_ots === null) {
					console.log('Checking if upgrade is available');
					return OpenTimestamps.upgrade(detached).then((changed) => {
						console.log(changed);
						if(changed) {
							console.log('Timestamp upgraded, updating OTS record');
							return timestamp.update({
								upgraded_ots: detached.serializeToBytes().reduce((accum, point) => { return accum += d2h(point); }, ''),
							});
						} else {
							console.log('Timestamp not upgraded yet...');
						}
					});
				}
			}

			return true;
		}).catch(console.error);

		return false;
	}
}
