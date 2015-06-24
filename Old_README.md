# github-baby-client
A baby project that acts as a github client

##Request-Response Cycle (Middleware chain)
---

1. **AbuseFilter Layer**: Filters off the IPs/users that are trying to abuse
2. **Routes Layer**:

	`/`:
	
	Returns the index page.
	**STOPS THE REQUEST-RESPONSE CYCLE**

	`/search/repositories`:
		Name | Type   | Description
		-----|--------|----------
		q	 | string | Search keywords (including qualifiers)
		sort | string | The sort field. One of `stars`, `forks`, or `updated`. Default: results are sorted by best match.
		order| string |	The sort order if sort parameter is provided. One of `asc` or `desc`. Default: `desc`

		* `in` Qualifies which fields are searched. With this qualifier you can restrict the search to just the repository name, description, readme, or any combination of these.
		* `size` Finds repositories that match a certain size (kb)
		* `forks` Filters repositories based on number of forks
		* `fork` Filters whether forked repositories should be included (`true`) or only forked repositories should be returned (`only`)
		* `created` or `pushed` Filters repositories based on date of creation, or when they were last created
		* `user` or `repo` Limits searches to a specific user or repository
		* `language` Searches repositories based on the language they're written in
		* `stars` Searches repositories based on the number of stars

3. *ReadCache Layer*: Checks if the data is available in the cache database. If it is fresh enough (less than 1 hour stale), returns that, and STOPS THE REQUEST-RESPONSE CYCLE

4. *APIRequest Layer*:
=======
	
	| Name | Type   | Description |
	| ---|-----|-------- |
	| q	 | string | Search keywords (including qualifiers) |
	| sort | string | The sort field. One of `stars`, `forks`, or `updated`. Default: results are sorted by best match. |
	| order| string |	The sort order if sort parameter is provided. One of `asc` or `desc`. Default: `desc` |

  * `in` Qualifies which fields are searched. With this qualifier you can restrict the search to just the repository name, description, readme, or any combination of these.
  * `size` Finds repositories that match a certain size (kb)
  * `forks` Filters repositories based on number of forks
  * `fork` Filters whether forked repositories should be included (`true`) or only forked repositories should be returned (`only`)
  * `created` or `pushed` Filters repositories based on date of creation, or when they were last created
  * `user` or `repo` Limits searches to a specific user or repository
  * `language` Searches repositories based on the language they're written in
  * `stars` Searches repositories based on the number of stars

3. **ReadCache Layer**: Checks if the data is available in the cache database. If it is fresh enough (less than 1 hour stale), returns that, and STOPS THE REQUEST-RESPONSE CYCLE

4. **APIRequest Layer**:
	Makes a request to the github api and passes the returned data to the next layer

5. **UpdateCache Layer**
	Stores the data in the cache

6. **Render Layer**:
	The data is finally rendered to the client in the requested format.
