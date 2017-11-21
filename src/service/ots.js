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

		const timestamp = await this.OTSModel.find({
			where: {
				sha256: sha256,
			}
		});

		// Stamp the message
		if(!timestamp) {
			console.log('Timestamp doesn\'t exist, creating...');

			await OpenTimestamps.stamp(detached);

			const record = extra;
			record.sha256 = sha256;
			record.ots = detached.serializeToBytes().reduce((accum, point) => { return accum += d2h(point); }, '');
			record.data = data;

			return this.OTSModel.create(record);
		} else {
			console.log('Timestamp exists!');
		}
	}
}
