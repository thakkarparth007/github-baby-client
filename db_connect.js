var config = require('./config');
var MongoClient = require('mongodb').MongoClient;
var db = null;

function connect_db(cb) {
	var url = "mongodb://";
		url += config.database.username + ":" + config.database.password;
		url += config.database.host;
		url += ":" + config.database.port;
		url += "/" + config.database.db_name;

	MongoClient.connect(url, cb);
}

function reuse() {
	return db;
}

function create_new(cb) {
	connect_db(cb);
}

connect_db(function(err,d) {
	if(err)
		throw err;
	db = d;
});

module.exports.reuse = reuse;
module.exports.create_new = create_new;