var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/lol',function(req,res,next) {
  res.setHeader('Transfer-Encoding','chunked');
  console.log('First.');
  next();
  console.log('Again first.');
  setTimeout(function() {
  	res.end('Hulla!');
  }, 10000)
});

router.get('/lol',function(req,res,next) {
  console.log('Second.');
  res.write('Ya<br>');
});

module.exports = router;
