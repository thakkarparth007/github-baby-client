/*
	Filename: master_crawler.js

	Description:
	Reads the config from the global config file

	Options:
		-c 	clear data from past crawls
		-s 	display stats from past crawls
*/

var config = require('../../config.js');
var parseArgs = require('minimist');
var ipc_errors = require('./ipc_errors');
var db = require('../../db_connect.js');
var child_process = require('child_process');

var log = function() {
    var args = [ "MASTER CRAWLER: " + arguments[0] ];
    for(var i = 1; i < arguments.length; i++)
        args.push(arguments[i]);
    
    config.log.apply(this,args);
};

var worker_count = 0;
var explored_count = 0;
var unexplored_count = 0;
var total_repos_seen = 0;
var starttime = new Date();

function cleanup(workerid) {
	return new Promise(function(resolve,reject) {
		var _db = db.reuse();
		_db.collection('for_clustering').update( 
			{ explored: 'exploring:worker#' + workerid },
			{ $set: { explored: false }},
			function(err) {
				if(err) {
					log("CLEAN-UP-ERROR: ", err);
					reject(err);
				}
				else {
					log("Cleaned up worker#%d", workerid);
					resolve(true);
				}
			}
		);
	});
}

function worker_dead(workerid) {
	worker_count--;
	log("Worker#%d died.", workerid);
	if(!worker_count) {
		log("All workers exited. Master Exiting.");
		process.exit();
	}
}

function clear_past_crawls() {
	var _db = db.reuse();

	// remove the old records
}

function display_past_stats() {
	var _db = db.reuse();

	// display the past statistics
}

/*********** Listeners to the right hand worker *************/
var right_hand_msg = function(workerid) {
	return function(msg) {
		if(msg.status === ipc_errors.FETCHED) {
			config.log("Right Worker fetched %d repos. Last id: %d.", msg.result.inserted_count, msg.result.last_id);
		}
		if(msg.status === ipc_errors.RATE_LIMIT_EXCEEDED) {
			config.log("Right Worker sleeping for %d seconds. Rate limit exceeded.", msg.resettingin / 1000);
		}
		if(msg.status === ipc_errors.TOO_MANY_RETRIES) {
			config.log("Right Worker dying. Too many retries.");
		}
		if(msg.status === ipc_errors.UNAUTHORIZED) {
			config.log("Right Worker - UNAUTHORIZED");
		}
	};
};

var right_hand_error = function(workerid) {
	return function(err) {

	};
};

var right_hand_exit = function(workerid) {
	return function(err) {
		worker_dead(workerid);
	};
};

/*********** Listeners to the left hand worker *************/
var left_hand_msg = function(workerid) {
	return function(msg) {
		if(msg.status === ipc_errors.FETCHED) {
			explored_count++;
			config.log("Repos explored: %d.\t\tSpeed: %d Repos/minute", explored_count, (explored_count * 60000) / (new Date() - starttime));
		}
		if(msg.status === ipc_errors.RATE_LIMIT_EXCEEDED) {
			config.log("Left Worker#%d sleeping for %d seconds. Rate limit exceeded.", workerid, msg.resettingin / 1000);
		}
		if(msg.status === ipc_errors.TOO_MANY_RETRIES) {
			config.log("Left Worker#%d dying. Too many retries.", workerid);
		}
		if(msg.status === ipc_errors.UNAUTHORIZED) {
			config.log("Left Worker#%d - UNAUTHORIZED.", workerid);
		}
	};
};

var left_hand_error = function(workerid) {
	return function(err) {

	};
};

var left_hand_exit = function(workerid) {
	return function(err) {
		if(err) {
			log("ERROR: ");
		}
		else {
			cleanup(workerid)
			.then(function() {
				worker_dead(workerid);
			});
		}
	};
};

/********************* Main ******************************/

var args = parseArgs( process.argv.slice(2) );
var opts = config.crawler;

var uname = opts.auth[0].username,
	pwd = opts.auth[0].password;

log("Starting right-hand worker.");

var right_hander = 
	child_process
		.fork('./right-hand.js', [0, uname,pwd])
		.on('message', right_hand_msg(0))
		.on('error', right_hand_error(0))
		.on('exit', right_hand_exit(0));

worker_count++;

log("Starting left-hand workers.");
var left_handers = [];
for(var i = 1; i < opts.auth.length; i++) {
	log("Starting left worker#%d.", i);
	// pass the worker id, username and password
	uname = opts.auth[i].username,
	pwd = opts.auth[i].password;

	left_handers.push(
		child_process
			.fork('./left-hand.js', [i, uname, pwd])
			.on('message', left_hand_msg(i))
			.on('error', left_hand_error(i))
			.on('exit', left_hand_exit(i))
	);

	worker_count++;
}

process.on('SIGINT', function() {
	log("Received SIGINT. Cleaning up...");

	var id = 1;
	var cleanups = left_handers.map(function(child) {
		child.kill();
		return cleanup(id++);
	});

	Promise.all(cleanups).then(function() {
		log("Cleaned up. Exiting.");
		process.exit();
	});
});