var log = require('../../config').log;

module.exports.init = function(name) {
	return function(repo, res, err) {
		if(/(401|403|204)/.test(res.headers.status)) { // unauthorized/forbidden/no content
			log(name + " ERROR: %s.", res.headers.status, res.request.uri.path);
			return { 
				unauthorized: true, 
				moveon: true,
				res: res,
				repo: repo
			};
		}
		else if(res.headers['x-ratelimit-remaining'] == '0') {
			log(name + "ERROR: RateLimit-Exceeded. Will retry when ratelimit resets.");
			return { 
				ratelimitexceeded: true, 
				moveon: true, 
				resettingin: (new Date(+res.headers['x-ratelimit-reset'] * 1000) - new Date()),
				res: res
			};
		}
		else {
			return { 
				unknown: true, 
				retry: true,
				res: res,
				error: err
			};
		}
	};
};
