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

The closed-testing forms now submit directly to Firebase Realtime Database from the browser.

1. Create a Firebase project and enable Realtime Database.
2. Replace the placeholder values in [assets/firebase-config.js](/c:/Dev/easterling-ms/assets/firebase-config.js) with your Firebase web app config.
3. Publish the rules from [firebase/database.rules.json](/c:/Dev/easterling-ms/firebase/database.rules.json) in the Firebase console or with the Firebase CLI.

The `closed_test_signups` path stores:

- `email`
- `email_key`
- `name`
- `device_type`
- `phone_model`
- `heard_about`
- `source`
- `consent_marketing`
- `user_agent`
- `created_at`

The Realtime Database rules allow public creates from the site, block reads, and block updates/deletes so each email address behaves like a one-time signup.

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

4. Import the export file into Realtime Database:

```powershell
npm run import:firebase -- .\closed_test_signups.json
```

The importer writes records into the `closed_test_signups` path using an encoded lowercased email address as the child key.

## Scheduled Newsletter Draft Generator

There is now a Firebase scheduled function that generates newsletter drafts with OpenAI and stores them in Firestore for review before anything is sent to Beehiiv.

### What it does

- Runs on a schedule
- Reads queued source items from `newsletter_sources`
- Calls OpenAI to write a newsletter draft
- Stores the result in `newsletterDrafts/{YYYY-MM-DD}`
- Marks the consumed source items as `drafted`

This worker does **not** publish to Beehiiv yet. It only creates reviewable drafts.

### Firestore collections

`newsletter_sources` documents should look roughly like this:

```json
{
  "title": "OpenAI shipped X",
  "url": "https://example.com/story",
  "notes": "Focus on why this matters for small teams.",
  "summary": "Optional short source recap",
  "issueDate": "2026-04-20",
  "status": "queued"
}
```

Generated drafts are written into `newsletterDrafts` with fields like:

- `title`
- `subjectLine`
- `summary`
- `intro`
- `sections`
- `closing`
- `contentMarkdown`
- `status`
- `approved`
- `sources`

### Setup

1. Install the function dependencies:

```powershell
cd firebase/functions
npm install
```

2. Set the OpenAI secret for Firebase Functions:

```powershell
firebase functions:secrets:set OPENAI_API_KEY
```

3. Optional runtime configuration values can be set in `firebase/functions/.env` when testing locally, or in your deployment environment:

```dotenv
OPENAI_MODEL=gpt-5-mini
FUNCTION_REGION=us-central1
NEWSLETTER_NAME=Easterling Media & Systems
NEWSLETTER_AUDIENCE=founders, operators, and technically curious builders
NEWSLETTER_TONE=clear, grounded, concise, and insightful without hype
NEWSLETTER_SOURCE_COLLECTION=newsletter_sources
NEWSLETTER_DRAFT_COLLECTION=newsletterDrafts
NEWSLETTER_MAX_SOURCES=5
NEWSLETTER_MAX_SECTIONS=4
NEWSLETTER_REQUIRE_SOURCES=true
```

4. Optional parameter overrides for the scheduler:

```powershell
firebase functions:params:set NEWSLETTER_SCHEDULE="every monday 08:00"
firebase functions:params:set NEWSLETTER_TIME_ZONE="America/New_York"
```

5. Deploy the function:

```powershell
firebase deploy --only functions:generateScheduledNewsletterDraft
```

### Default behavior

- Schedule: every Monday at 8:00 AM
- Time zone: America/New_York
- Draft document ID: `YYYY-MM-DD`
- Existing draft for the same issue date: skipped
- No queued sources and `NEWSLETTER_REQUIRE_SOURCES=true`: skipped

### Run one manually today

If you want a draft immediately without waiting for the scheduler, you can run:

```powershell
$env:OPENAI_API_KEY="your-openai-key"
$env:FIREBASE_PROJECT_ID="your-project-id"
$env:FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxx@your-project-id.iam.gserviceaccount.com"
$env:FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
npm run generate:newsletter -- 2026-04-13
```

That uses the same draft shape and writes directly to Firestore as `newsletterDrafts/2026-04-13`.

### Publish a draft to Beehiiv

Once a draft is ready in Firestore, publish it to Beehiiv with:

```powershell
$env:BEEHIIV_API_KEY="your-beehiiv-key"
$env:BEEHIIV_PUBLICATION_ID="your-publication-id"
npm run publish:newsletter -- 2026-04-13
```

You can use `BEEHIIV_PUBLICATION_NAME` instead of `BEEHIIV_PUBLICATION_ID` if that is easier for your account setup.

This script:

- Refuses to publish if the Firestore draft already has Beehiiv fields set
- Creates the Beehiiv post from the Firestore draft content
- Writes the Beehiiv post ID and URL back into `newsletterDrafts/{YYYY-MM-DD}`
