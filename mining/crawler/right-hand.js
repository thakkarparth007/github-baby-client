"use strict";
/*
    Filename: right-hand.js
*/

var db = require('../../db_connect.js');
var api_errors = require('./api_errors');
var ipc_errors = require('./ipc_errors');
var request = require('request');
var config = require('../../config.js');

if(process.argv.length !== 5)
{
    config.log('FATAL ERROR: Expected exactly 3 arguments. %d provided.', process.argv.length-2);
    process.exit();
}

var id = process.argv[2],
    uname = process.argv[3],
    pwd = process.argv[4];

var handle_api_request_errors = api_errors.init("Right-Hand Worker#" + id);

var log = (function() {
    var _process = function() {
        var args = [ "Right-Hand Worker#" + id + ": " + arguments[0] ];
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
var MAX_RETRY_COUNT = config.crawler.right_hand.MAX_RETRY_COUNT,
    RETRY_TIME = config.crawler.right_hand.RETRY_TIME;

var for_clustering = null;
var fetched_records = 0;

log.info("Started %s, %s", uname, pwd);

var request_opts = {
    url: "https://" + uname + ":" + pwd + "@api.github.com/repositories?since=",
    headers: {
        'User-Agent': config.crawler.UserAgent
    }
};

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

function work(since) {
    get_data(since)
        .then(function(result) {
            work(result.since);
            return result.repo_list;
        })
        .then(insert_in_db)
        .then(function(result) {
            process.send({ status: ipc_errors.FETCHED, result: result });
        })
        .catch(function(err) {
            if(err.unauthorized) {  // skip this, and try next one. Github gives 401 for random repos
                process.send({ status: ipc_errors.UNAUTHORIZED });
                work();
            }
            else if(err.ratelimitexceeded) {    // sleep.
                process.send({ status: ipc_errors.RATE_LIMIT_EXCEEDED, resettingin: resettingin });
                setTimeout(work, err.resettingin);
            }
            else if(err.retrying) {
                retry(err.error);
            }
            else if(err) {
                log.error("FATAL ERROR: ", err);
                process.exit();
            }
        });
}

// returns { since: since, repo_list: repo_list }
function get_data(since) {
    return new Promise(function(resolve,reject) {
        //log("Fetching %s", request_opts.url);
        //log(request_opts.url);
        var auth = "";
        if(uname != '*' && pwd != '*')
            auth = uname + ":" + pwd + "@";

        request_opts.url = "https://" + auth + "api.github.com/repositories?since=" + since;
        request(request_opts, function(err,res,body) {
            if(err) {
                reject(err);
                return;
            }
            try {
                var repo_list = JSON.parse(body);
                var since = res.headers.link.match(/^<[^\?]+\?since=([^>]+)>/)[1];

                repo_list = repo_list.map(function(old) {
                    return {
                        id: old.id,
                        name: old.name,
                        explored: false,
                        owner: old.owner.login
                    };
                });
                resolve({ repo_list: repo_list, since: since });
            }
            catch(e) {
                reject(handle_api_request_errors(null,res,e));
            }
        });
    });
}

// resolves with { inserted_count: INTEGER, last_id: INTEGER }
function insert_in_db(repo_list) {
    return new Promise(function(resolve,reject) {
        try {
            var last_id = repo_list[ repo_list.length - 1 ].id;
            
            for_clustering.insertMany(repo_list,function(err, res) {
                if(err) {
                    throw err;
                }
                fetched_records += res.insertedCount;
                log.info('Successfully inserted %d records in the `for_clustering` collection.', res.insertedCount);
                for_clustering.update(
                    { last_repo_id: { $exists: true } },
                    { last_repo_id: last_id },
                    { upsert: true },
                    function(err) {
                        if(err) {
                            throw err;
                        }
                        log.info('Last inserted Id: %d', last_id);
                        resolve({ inserted_count: res.insertedCount, last_id: last_id });
                    });
            });
        }
        catch(e) {
            log.error('Failed inserting in DB. Exiting.', e);
            process.exit();
        }
    });
}

db.create_new(function(err,d) {
    if(err) {
        throw err;
    }

    db = d;
    for_clustering = db.collection('for_clustering');
    for_clustering.createIndex({ id: '1' });

    work._retry_count = 0;

    // continue only from the last seen
    for_clustering.findOne(
        { last_repo_id: {$exists: true} },
        function(err,doc) {
            //log("Last id: %d", doc.last_repo_id);
            if(err) {
                throw err;
            }
            if(doc) {
                work(doc.last_repo_id);
            }
            else {
                work('');
            }
        }
    );
});