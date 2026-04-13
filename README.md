# Easterling Media & Systems
Website hub for all my content, builds, blogs, newsletter, etc.

## Beehiiv Sync

The site can auto-sync Beehiiv newsletter content into the local static file [assets/beehiiv-posts.json](/c:/Dev/easterling-ms/assets/beehiiv-posts.json) by running:

```powershell
$env:BEEHIIV_API_KEY="your-key"
npm run sync:beehiiv
```

If `BEEHIIV_API_KEY` is missing or the API request fails, the sync script falls back to the public Beehiiv publication website so the on-site archive can still stay current.

For GitHub automation, add a repository secret named `BEEHIIV_API_KEY`.
If your Beehiiv account has more than one publication, also add a repository variable named `BEEHIIV_PUBLICATION_ID` or `BEEHIIV_PUBLICATION_NAME`.
If you want to force the public-site fallback to a specific publication URL, set `BEEHIIV_WEBSITE_URL`.

## Closed Testing Signups

The closed-testing forms now submit directly to Firebase Cloud Firestore from the browser.

1. Create a Firebase project and enable Firestore.
2. Replace the placeholder values in [assets/firebase-config.js](/c:/Dev/easterling-ms/assets/firebase-config.js) with your Firebase web app config.
3. Publish the rules from [firebase/firestore.rules](/c:/Dev/easterling-ms/firebase/firestore.rules) in the Firebase console or with the Firebase CLI.

The `closed_test_signups` collection stores:

- `email`
- `name`
- `device_type`
- `phone_model`
- `heard_about`
- `source`
- `consent_marketing`
- `user_agent`
- `created_at`

The Firestore rules allow public creates from the site, block reads, and block updates/deletes so each email address behaves like a one-time signup.

## Migrating Existing Supabase Data

If you already have signup records in Supabase:

1. Export `closed_test_signups` from Supabase as JSON.
2. Install dependencies with `npm install`.
3. Set these environment variables for a Firebase service account:

```powershell
$env:FIREBASE_PROJECT_ID="your-project-id"
$env:FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxx@your-project-id.iam.gserviceaccount.com"
$env:FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

4. Import the export file into Firestore:

```powershell
npm run import:firebase -- .\closed_test_signups.json
```

The importer writes documents into the `closed_test_signups` collection using the lowercased email address as the document ID.
