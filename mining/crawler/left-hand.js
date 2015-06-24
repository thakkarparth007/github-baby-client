/*
	Filename: left-hand.js
*/

var config = require('../../config.js');
var db = require('../../db_connect.js');
var api_errors = require('./api_errors');
var ipc_errors = require('./ipc_errors');
var request = require('request');

if(process.argv.length !== 5)
{
	config.log('FATAL ERROR: Expected exactly 3 arguments. %d provided.', process.argv.length-2);
	process.exit();
}

var id = process.argv[2],
	uname = process.argv[3],
	pwd = process.argv[4];

var handle_api_request_errors = api_errors.init("Left-Hand Worker#" + id);
var log = (function() {
    var _process = function() {
        var args = [ "Left-Hand Worker#" + id + ": " + arguments[0] ];
        for(var i = 1; i < arguments.length; i++)
            args.push(arguments[i]);
        return args;
    };

    return  {
        info: function() {
            //var args = _process.apply(this,arguments);
            //console.log.apply(this,args);
        },
        error: function() {
            var args = _process.apply(this,arguments);
            console.log.apply(this,args);
        }
    };
})();

// config variables
var MAX_RETRY_COUNT = config.crawler.left_hand.MAX_RETRY_COUNT,
	RETRY_TIME = config.crawler.left_hand.RETRY_TIME;

var explored = null;
var for_clustering = null;
var users = null;

log.info("Started %s, %s", uname, pwd);

function retry(e) {
	log.error("ERROR: ", e);
	if(work._retry_count < MAX_RETRY_COUNT) {
		work._retry_count++;
		setTimeout(work, RETRY_TIME);
		throw { retrying: true };
	}
	else {
		log.error("FATAL ERROR: %d retries failed. Exiting.", MAX_RETRY_COUNT);
		process.send({ status: ipc_errors.TOO_MANY_RETRIES });
		process.exit();
	}
}

function work() {
	find_unexplored_doc()
		.then(function(doc) {
			// if no unexplored doc wait for a while and retry
			if(!doc) {
				retry(new Error("No unexplored doc found."));
			}
			else {
				//work._retry_count = 0;
				return Promise.resolve(doc);
			}
		})
		.then(collect_data)
		.then(function(data_array) {
			work();
			return (data_array);
		})
		.then(make_the_docs)    // explored and users collection-docs
		.then(insert_in_db)
		.then(mark_as_done)
		.then(function() {
			process.send({ status: ipc_errors.FETCHED });
		})
		.catch(function(err) {
			if(err.unauthorized) {	// skip this, and try next one. Github gives 401 for random repos
				process.send({ status: ipc_errors.UNAUTHORIZED });
				mark_as_done(err.repo).then(work);
			}
			else if(err.ratelimitexceeded) {	// sleep.
				process.send({ status: ipc_errors.RATE_LIMIT_EXCEEDED, resettingin: err.resettingin });
				setTimeout(work, err.resettingin);
			}
			else if(err.retrying) {
				retry(err.error);
			}
			else if(err) {
				log.error("FATAL ERROR: ", err, err.stack);
				process.exit();
			}
		});
}

function find_unexplored_doc() {
	return new Promise(function(resolve,reject) {
		for_clustering.findOneAndUpdate( 
			{ explored: false },
			{ $set: { explored: 'exploring:worker#' + id }},
			function(err, doc) {
				if(err) {
					reject(err);
				}
				else if(doc.value) {
					resolve(doc.value);
				}
				else {
					log.error("Finding a document to explore failed.", doc);
					resolve(null);
					//reject(new Error("Finding a document to explore failed."));
				}
			 }
		);
	});
}

// https://api.github.com/repos/{username}/{reponame}
function get_repo_data(doc) {
	var request_opts = {
		url: 'https://' + uname + ":" + pwd + "@api.github.com/repos/" + doc.owner + "/" + doc.name,
		headers: {
			'User-Agent': config.crawler.UserAgent
		}
	};
	return new Promise(function(resolve,reject) {
		request(request_opts, function(err,res,body) {
			try {
				if(err) {
					reject(err);
				}
				else {
					var repo = JSON.parse(body);
					log.info("Received data for repo %s.", doc.name);
					var ret = {
						id: repo.id,
						name: repo.name,
						description: repo.description,
						owner_id: repo.owner.id,
						owner_login: repo.owner.login,

						stargazers_count: repo.stargazers_count,
						subscribers_count: repo.subscribers_count,
						forks_count: repo.forks_count,
						watchers: repo.watchers,
						size: repo.size,
						open_issues: repo.open_issues,
						created_at: repo.created_at,
						updated_at: repo.updated_at,
						pushed_at: repo.pushed_at
					};
					resolve(ret);
				}
			}
			catch(e) {
				reject(handle_api_request_errors(doc,res,e));
			}
		});
	});
}

// https://api.github.com/repos/{username}/{reponame}/languages
function get_languages(doc) {
	var request_opts = {
		url: 'https://' + uname + ":" + pwd + "@api.github.com/repos/" + doc.owner + "/" + doc.name + "/languages",
		headers: {
			'User-Agent': config.crawler.UserAgent
		}
	};
	return new Promise(function(resolve,reject) {
		request(request_opts, function(err,res,body) {
			try {
				if(err) {
					reject(err);
				}
				else {
					var languages = JSON.parse(body);
					log.info("Received languages for repo %s.", doc.name);
					resolve(languages);
				}
			}
			catch(e) {
				reject(handle_api_request_errors(doc,res,e));
			}
		});
	});
}

// https://api.github.com/repos/{username}/{reponame}/languagescontributors
function get_contributers_count(doc) {
	var request_opts = {
		url: 'https://' + uname + ":" + pwd + "@api.github.com/repos/" + doc.owner + "/" + doc.name + "/contributors",
		headers: {
			'User-Agent': config.crawler.UserAgent
		}
	};
	return new Promise(function(resolve,reject) {
		request(request_opts, function(err,res,body) {
			try {
				if(err) {
					reject(err);
				}
				else {
					var contributors = JSON.parse(body);
					log.info("Received contributors_count for repo %s.", doc.name);
					// return only the contributor count
					resolve(contributors.length);
				}
			}
			catch(e) {
				reject(handle_api_request_errors(doc,res,e));
			}
		});
	});
}

// resolves with true or false based on whether user is known
// rejects with error if any
function check_if_user_is_known(doc) {
	log.info("Checking is user %s is known.", doc.owner);
	return new Promise(function(resolve,reject) {
		users.findOne({ login: doc.owner }, function(err,user) {
			log.info("Checked if the user %s is known.", doc.owner);
			if(err)
				throw err;
			if(user)
				resolve(true);
			else
				resolve(false);
		});
	});
}

// does NOT actually fetch the data. fetch_user_data() does that
// resolves with the user if the user must be fetched from Github
// resolves with true if the user is already stored in the db
// rejects with { retrying: true } and calls the retry()
// if retry attempts exceed, retry() exits anyway.
function get_user_data(doc) {
	log.info("Collecting user_data for %s.", doc.owner);
	return check_if_user_is_known(doc)
			.then(function(is_known) {
				log.info("Gonna fetch data for user %s. (is_known: %d)", doc.owner, is_known);
				if(!is_known)
					return fetch_user_data(doc);
				else
					return true;
			});
	
}

// https://api.github.com/users/{username}
function fetch_user_data(doc) {
	log.info("Fetching data for user %s.", doc.owner);
	var request_opts = {
		url: 'https://' + uname + ":" + pwd + "@api.github.com/users/" + doc.owner,
		headers: {
			'User-Agent': config.crawler.UserAgent
		}
	};
	return new Promise(function(resolve,reject) {
		request(request_opts, function(err,res,body) {
			try {
				if(err) {
					reject(err);
				}
				else {
					var user_data = JSON.parse(body);
					log.info("Fetched data for user %s.", doc.owner);
					var ret = {
						id: user_data.id,
						login: user_data.login,
						public_repos: user_data.public_repos,
						public_gists: user_data.public_gists,
						followers: user_data.followers,
						following: user_data.following,
						location: user_data.location,
						company: user_data.company,
						hireable: user_data.hireable
					};
					resolve(ret);
				}
			}
			catch(e) {
				reject(handle_api_request_errors(doc,res,e));
			}
		});
	});
}

function collect_data(doc) {
	log.info("Collecting data for repo %s.", doc.name);
	return Promise.all([
		get_repo_data(doc),
		get_languages(doc),
		get_contributers_count(doc),
		get_user_data(doc)
	]);
}

function make_the_docs(data_array) {
	var repo = data_array[0],
		languages = data_array[1],
		contributors_count = data_array[2],
		user = data_array[3];

	log.info("Aggregating data for repo %s.", repo.name);
	repo.languages = languages;
	repo.contributors_count = contributors_count;

	return { repo: repo, user: user };
}

// resolves with the repo just inserted repo
function insert_in_db(docs) {
	log.info("Inserting data for repo %s.", docs.repo.name);
	return new Promise(function(resolve,reject) {
		var repo = docs.repo,
			user = docs.user;

		// check if user === true - that is, if the user is already in the db
		if(user !== true) {
			users.insert(user, function(err) {
				if(err) throw err;
			});
		}
		explored.insert(repo, function(err) {
			if(err)	throw err;
			else resolve(repo);
		});
	});
}

function mark_as_done(repo) {
	return new Promise(function(resolve,reject) {
		for_clustering.update({ id: repo.id }, 
				{ $set: { explored: true } },
				function(err) {
					if(err)	reject(err);
					else 	resolve(true);
				});
	});
}

db.create_new(function(err,d) {
	if(err) {
		throw err;
	}

	db = d;
	for_clustering = db.collection('for_clustering');
	explored = db.collection('explored');
	users = db.collection('users');

	explored.createIndex({ id: 1 });
	work._retry_count = 0;
	work();
});