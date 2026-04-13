import fs from 'node:fs/promises';
import process from 'node:process';
import { GoogleAuth } from 'google-auth-library';

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error('Usage: node scripts/import-supabase-to-firestore.mjs <path-to-supabase-export.json>');
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY.');
  process.exit(1);
}

const raw = await fs.readFile(inputPath, 'utf8');
const rows = JSON.parse(raw);

if (!Array.isArray(rows)) {
  console.error('Expected a JSON array export from Supabase.');
  process.exit(1);
}

const auth = new GoogleAuth({
  projectId,
  credentials: {
    client_email: clientEmail,
    private_key: privateKey,
  },
  scopes: ['https://www.googleapis.com/auth/datastore'],
});

const authClient = await auth.getClient();
const accessTokenResponse = await authClient.getAccessToken();
const accessToken = accessTokenResponse.token || accessTokenResponse;

if (!accessToken) {
  console.error('Unable to obtain a Firebase access token from the provided service account.');
  process.exit(1);
}

const batchSize = 400;
let imported = 0;

for (let start = 0; start < rows.length; start += batchSize) {
  const chunk = rows.slice(start, start + batchSize);
  const writes = [];

  for (const row of chunk) {
    const email = String(row.email || '').trim().toLowerCase();
    if (!email) {
      continue;
    }

    writes.push({
      update: {
        name: documentPath(projectId, email),
        fields: {
          email: stringField(email),
          name: nullableStringField(row.name),
          device_type: nullableStringField(row.device_type),
          phone_model: nullableStringField(row.phone_model),
          heard_about: nullableStringField(row.heard_about),
          source: stringField(normalizeSource(row.source)),
          consent_marketing: { booleanValue: Boolean(row.consent_marketing) },
          user_agent: nullableStringField(row.user_agent),
          created_at: timestampField(row.created_at),
        },
      },
    });
    imported += 1;
  }

  if (writes.length) {
    await commitWrites(projectId, accessToken, writes);
  }
}

console.log(`Imported ${imported} signup records into Firestore.`);

function normalize(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

function normalizeSource(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['home', 'blog', 'newsletter'].includes(normalized) ? normalized : 'home';
}

function normalizeTimestamp(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function documentPath(projectIdValue, email) {
  return `projects/${projectIdValue}/databases/(default)/documents/closed_test_signups/${email}`;
}

function stringField(value) {
  return { stringValue: String(value) };
}

function nullableStringField(value) {
  const normalized = normalize(value);
  return normalized === null ? { nullValue: null } : { stringValue: normalized };
}

function timestampField(value) {
  return { timestampValue: normalizeTimestamp(value) };
}

async function commitWrites(projectIdValue, accessTokenValue, writes) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectIdValue}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessTokenValue}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Firestore import failed: ${response.status} ${errorText}`);
  }
}
