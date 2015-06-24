module.exports = 
{
	"is_proxied": false,			// is the server behind a proxy?
	"env": "dev",					// what is the environment? production or development?
	"log": console.log,				// what log function should be used?

	"host": "localhost",
	"port": 3000,

	// database credentials.
	"database": {
		"db_name": "github-baby-client",
		"host": "localhost",
		"port": 27017,
		"username": "",
		"password": "",

		"TRY_AGAIN_TIME": 1000		// wait for 1000ms before retrying to connect to the db.
	},
	"abuse_filter": {
		"ABUSE_DEFINITION": 150,	// number of requests allowed per minute. Above this, you're abusive.
		"EXPIRE_AFTER_SECONDS": 60,	// number of seconds for which mongodb stores the ip-records,
		"BLOCK_TIME": 900000,		// block a bad guy for 15 minutes. (15*60*1000ms)

		"db_name": "abuse_filter"
	},
	"crawler": {
		"log": console.log,
		"UserAgent": 'github-baby-client',
		
		"right_hand": {
			"MAX_RETRY_COUNT": 1,
			"RETRY_TIME": 1000,
		},
		"left_hand": {
			"MAX_RETRY_COUNT": 1,
			"RETRY_TIME": 1000,	
		},
		// authentication information for the crawlers - to have a cap of 5000 requests per hour
		// first set of credentials is for the right hand worker.
		// the others for the left hand workers. Have as many sets as you need.
		// For a quad-core processor, with one right-hand crawler and 4 left-hand crawlers,
		// one can achieve speeds around 130 repos/minute.
		// leave the values as '*'s, to use the api without authentication - that limits you
		// to 60 requests per hour.
		"auth": [
			{
				"username": "*",
				"password": "*"
			},
			{
				"username": "*",
				"password": "*"
			},
			{
				"username": "*",
				"password": "*"
			},
			{
				"username": "*",
				"password": "*"
			},
			{
				"username": "*",
				"password": "*"
			},
			{
				"username": "*",
				"password": "*"
			},
		]
	}
};