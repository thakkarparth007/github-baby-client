var express = require('express');
var request = require('request');
var router = express.Router();

/* GET seach/repositories listing. */
router.get('/', function(req, res, next) {
	var qs = req.originalUrl.substr( req.originalUrl.indexOf("?") );
	qs = (qs[0] == '?' ? qs : '');
	var options = {
		url: 'https://api.github.com/search/repositories' + qs, 
		headers: {
			'User-Agent': 'github-baby-client'
		}
	};

	request(options).pipe(res);
});

module.exports = router;
