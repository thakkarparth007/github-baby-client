/*
	File-Name: worker.js
	Description:
		Goes through the repos collected in the for_clustering collection,
		and for each repo gets the readme file. Then it combines the readme
		and the description. From this, it extracts buzzwords, and stores them
		in the database, in two collections:
			buzzwords:
			{
				id,
				word,
				total_count
			}
			repo_buzzwords:
			{
				wordid,
				repoid,
				count 		(the number of appearances of the word in the repo)
				where		('d' or 'r' for 'description' or 'readme')
			}
 */

