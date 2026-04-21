import fs from 'node:fs/promises';
import process from 'node:process';
import { GoogleAuth } from 'google-auth-library';

const defaultDatabaseUrl = 'https://easterling-media-systems-default-rtdb.firebaseio.com';
const defaultSheetName = 'MindMark Signups';
const defaultSpreadsheetTitle = 'MindMark Closed Testing Signups';

await loadEnvFile('.env.local');
await loadEnvFile('firebase/functions/.env.local');

const projectId = normalizeEnvValue(process.env.FIREBASE_PROJECT_ID);
const clientEmail = normalizeEnvValue(process.env.FIREBASE_CLIENT_EMAIL);
const privateKey = normalizeEnvValue(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n');
const databaseUrl = normalizeEnvValue(process.env.FIREBASE_DATABASE_URL) || defaultDatabaseUrl;
const spreadsheetId = normalizeEnvValue(process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
const sheetName = normalizeEnvValue(process.env.GOOGLE_SHEETS_SHEET_NAME) || defaultSheetName;

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY.');
  process.exit(1);
}

const auth = new GoogleAuth({
  projectId,
  credentials: {
    client_email: clientEmail,
    private_key: privateKey,
  },
  scopes: [
    'https://www.googleapis.com/auth/firebase.database',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/userinfo.email',
  ],
});

const authClient = await auth.getClient();
const accessTokenResponse = await authClient.getAccessToken();
const accessToken = accessTokenResponse.token || accessTokenResponse;

if (!accessToken) {
  console.error('Unable to obtain an access token from the provided service account.');
  process.exit(1);
}

const signups = await readSignups(databaseUrl, accessToken);
const rows = buildRows(signups);
const targetSpreadsheetId = spreadsheetId || await createSpreadsheet(accessToken, sheetName);

await ensureSheetExists(accessToken, targetSpreadsheetId, sheetName);
await clearSheet(accessToken, targetSpreadsheetId, sheetName);
await updateSheet(accessToken, targetSpreadsheetId, sheetName, rows);

console.log(`Synced ${rows.length - 1} signup records to Google Sheets.`);
console.log(`Spreadsheet ID: ${targetSpreadsheetId}`);
console.log(`Sheet tab: ${sheetName}`);

async function readSignups(databaseUrlValue, accessTokenValue) {
  const response = await fetch(`${databaseUrlValue}/closed_test_signups.json`, {
    headers: {
      Authorization: `Bearer ${accessTokenValue}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Realtime Database read failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  return payload && typeof payload === 'object' ? payload : {};
}

function buildRows(signups) {
  const headers = [
    'email',
    'name',
    'device_type',
    'phone_model',
    'heard_about',
    'source',
    'consent_marketing',
    'created_at_iso',
    'created_at_ms',
    'email_key',
    'user_agent',
  ];

  const records = Object.entries(signups)
    .map(([key, value]) => ({ key, value: value || {} }))
    .sort((a, b) => Number(a.value.created_at || 0) - Number(b.value.created_at || 0));

  return [
    headers,
    ...records.map(({ key, value }) => [
      normalize(value.email),
      normalize(value.name),
      normalize(value.device_type),
      normalize(value.phone_model),
      normalize(value.heard_about),
      normalize(value.source),
      value.consent_marketing === true ? 'TRUE' : 'FALSE',
      formatTimestamp(value.created_at),
      normalize(value.created_at),
      normalize(value.email_key) || key,
      normalize(value.user_agent),
    ]),
  ];
}

async function createSpreadsheet(accessTokenValue, title) {
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessTokenValue}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: defaultSpreadsheetTitle,
      },
      sheets: [
        {
          properties: {
            title,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets create failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  return payload.spreadsheetId;
}

async function ensureSheetExists(accessTokenValue, spreadsheetIdValue, title) {
  const metadata = await getSpreadsheet(accessTokenValue, spreadsheetIdValue);
  const exists = metadata.sheets?.some((sheet) => sheet.properties?.title === title);

  if (exists) {
    return;
  }

  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetIdValue}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessTokenValue}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title,
            },
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets add sheet failed: ${response.status} ${errorText}`);
  }
}

async function getSpreadsheet(accessTokenValue, spreadsheetIdValue) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetIdValue}?fields=sheets.properties.title`, {
    headers: {
      Authorization: `Bearer ${accessTokenValue}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets metadata read failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function clearSheet(accessTokenValue, spreadsheetIdValue, title) {
  const range = encodeURIComponent(`${title}!A:K`);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetIdValue}/values/${range}:clear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessTokenValue}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets clear failed: ${response.status} ${errorText}`);
  }
}

async function updateSheet(accessTokenValue, spreadsheetIdValue, title, rows) {
  const range = encodeURIComponent(`${title}!A1`);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetIdValue}/values/${range}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessTokenValue}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range: `${title}!A1`,
      majorDimension: 'ROWS',
      values: rows,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets update failed: ${response.status} ${errorText}`);
  }
}

function normalize(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || '';
}

function formatTimestamp(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return '';
  }

  const date = new Date(numericValue);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString();
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
    process.env[key.trim()] ??= normalizeEnvValue(valueParts.join('='));
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
