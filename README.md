# Easterling Media & Systems
Website hub for all my content, builds, blogs, newsletter, etc.

## Beehiiv Sync

The site can auto-sync Beehiiv newsletter content into the local static file [assets/beehiiv-posts.json](/c:/Dev/easterling-ms/assets/beehiiv-posts.json) by running:

```powershell
$env:BEEHIIV_API_KEY="your-key"
npm run sync:beehiiv
```

For GitHub automation, add a repository secret named `BEEHIIV_API_KEY`.
If your Beehiiv account has more than one publication, also add a repository variable named `BEEHIIV_PUBLICATION_ID` or `BEEHIIV_PUBLICATION_NAME`.

## Closed Testing Signups

The closed-testing forms submit directly to Supabase from the browser with your publishable key. Before they will work, run the SQL in [supabase/closed_test_signups.sql](/c:/Dev/easterling-ms/supabase/closed_test_signups.sql) inside the Supabase SQL editor for your project.

That table stores:

- `email`
- `name`
- `device_type`
- `phone_model`
- `heard_about`
- `source`
- `consent_marketing`
- `user_agent`
- `created_at`

The policy only allows inserts from the public site. It does not allow public reads of the signup list.
