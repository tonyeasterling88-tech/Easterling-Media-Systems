import fs from 'node:fs/promises';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { GoogleAuth } from 'google-auth-library';

const [, , inputPath] = process.argv;
const defaultDatabaseUrl = 'https://easterling-media-systems-default-rtdb.firebaseio.com';

if (!inputPath) {
  console.error('Usage: node scripts/import-supabase-to-realtime-database.mjs <path-to-supabase-export.json>');
  process.exit(1);
}

await loadEnvFile('.env.local');
await loadEnvFile('firebase/functions/.env.local');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = normalizeEnvValue(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n');
const databaseUrl = normalizeEnvValue(process.env.FIREBASE_DATABASE_URL) || defaultDatabaseUrl;

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY.');
  process.exit(1);
}

let raw;

try {
  raw = await fs.readFile(inputPath, 'utf8');
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error(`Could not find Supabase export file: ${inputPath}`);
    console.error('Export closed_test_signups from Supabase as JSON, then pass that file path to this command.');
    process.exit(1);
  }

  throw error;
}

let rows;

try {
  rows = JSON.parse(raw);
} catch {
  console.error(`Could not parse Supabase export as JSON: ${inputPath}`);
  process.exit(1);
}

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
  scopes: ['https://www.googleapis.com/auth/firebase.database', 'https://www.googleapis.com/auth/userinfo.email'],
});

const authClient = await auth.getClient();
const accessTokenResponse = await authClient.getAccessToken();
const accessToken = accessTokenResponse.token || accessTokenResponse;

if (!accessToken) {
  console.error('Unable to obtain a Firebase access token from the provided service account.');
  process.exit(1);
}

let imported = 0;

for (const row of rows) {
  const email = String(row.email || '').trim().toLowerCase();

  if (!email) {
    continue;
  }

  const key = emailKey(email);
  const signup = withoutNullValues({
    email,
    email_key: key,
    name: normalize(row.name),
    device_type: normalize(row.device_type),
    phone_model: normalize(row.phone_model),
    heard_about: normalize(row.heard_about),
    source: normalizeSource(row.source),
    consent_marketing: Boolean(row.consent_marketing),
    user_agent: normalize(row.user_agent),
    created_at: normalizeTimestamp(row.created_at),
  });

  await writeSignup(databaseUrl, accessToken, key, signup);
  imported += 1;
}

console.log(`Imported ${imported} signup records into Firebase Realtime Database.`);

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
    return Date.now();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return Date.now();
  }

  return parsed.getTime();
}

function emailKey(value) {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function withoutNullValues(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== null));
}

async function writeSignup(databaseUrlValue, accessTokenValue, key, signup) {
  const response = await fetch(`${databaseUrlValue}/closed_test_signups/${key}.json`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessTokenValue}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(signup),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Realtime Database import failed: ${response.status} ${errorText}`);
  }
}

async function loadEnvFile(path) {
  let contents;

  try {
    contents = await fs.readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }

    throw error;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split('=');
    process.env[key] ??= normalizeEnvValue(valueParts.join('='));
  }
}

function normalizeEnvValue(value) {
  const trimmed = String(value || '').trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}
