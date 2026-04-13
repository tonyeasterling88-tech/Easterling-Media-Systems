import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { GoogleAuth } from 'google-auth-library';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
await loadEnvFiles([
  path.join(repoRoot, '.env.local'),
  path.join(repoRoot, 'firebase', 'functions', '.env.local'),
]);

const issueDate = process.argv[2] || getIssueDate(new Date(), 'America/New_York');
const timeZone = process.env.NEWSLETTER_TIME_ZONE || 'America/New_York';
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const beehiivApiKey = process.env.BEEHIIV_API_KEY;
const beehiivPublicationId = process.env.BEEHIIV_PUBLICATION_ID;
const beehiivPublicationName = process.env.BEEHIIV_PUBLICATION_NAME;

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY.');
  process.exit(1);
}

if (!beehiivApiKey) {
  console.error('Missing BEEHIIV_API_KEY.');
  process.exit(1);
}

const draftCollection = process.env.NEWSLETTER_DRAFT_COLLECTION || 'newsletterDrafts';
const defaultBeehiivBaseUrl = 'https://easterling-ms-newsletter.beehiiv.com';

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
  console.error('Unable to obtain a Firestore access token.');
  process.exit(1);
}

const draft = await loadDraft(projectId, accessToken, draftCollection, issueDate);
if (!draft) {
  console.error(`Draft ${draftCollection}/${issueDate} was not found.`);
  process.exit(1);
}

if (draft.beehiivPostId || draft.beehiivUrl) {
  console.error(`Draft ${draftCollection}/${issueDate} already appears to be published to Beehiiv.`);
  process.exit(1);
}

if (draft.status && draft.status !== 'ready_for_review' && draft.status !== 'approved') {
  console.warn(`Draft status is ${draft.status}; publishing anyway because Beehiiv is the requested target.`);
}

const publication = await resolvePublication(beehiivApiKey);
const post = await createBeehiivPost({
  apiKey: beehiivApiKey,
  publicationId: publication.id,
  title: draft.title || draft.subjectLine || `Newsletter ${issueDate}`,
  subtitle: draft.summary || '',
  bodyHtml: draft.contentHtml || markdownToHtml(draft.contentMarkdown || ''),
  status: 'confirmed',
});

const beehiivUrl =
  post?.web_url ||
  post?.url ||
  `${publication.websiteUrl || defaultBeehiivBaseUrl}/p/${post?.slug || post?.id || issueDate}`;

await updateDraft(projectId, accessToken, draftCollection, issueDate, {
  beehiivPostId: cleanText(post?.id),
  beehiivUrl: cleanText(beehiivUrl),
  status: 'published',
  updatedAt: new Date().toISOString(),
  generator: {
    ...(draft.generator || {}),
    beehiivPublicationId: publication.id,
    beehiivPublishedAt: new Date().toISOString(),
  },
});

console.log(`Published draft ${draftCollection}/${issueDate} to Beehiiv as ${cleanText(post?.id) || 'unknown-id'}.`);

async function loadEnvFiles(paths) {
  for (const filePath of paths) {
    let raw;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex === -1) continue;

      const key = trimmed.slice(0, equalsIndex).trim();
      if (!key || process.env[key]) continue;

      let value = trimmed.slice(equalsIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value.replace(/\\n/g, '\n');
    }
  }
}

function getIssueDate(date, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function cleanText(value) {
  return String(value || '').trim();
}

async function firestoreRequest(projectIdValue, accessTokenValue, pathValue, options = {}) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectIdValue}/databases/(default)/documents/${pathValue}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${accessTokenValue}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Firestore request failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

function readDraftFromDocument(document) {
  const fields = document?.fields || {};
  return {
    title: stringValue(fields.title),
    subjectLine: stringValue(fields.subjectLine),
    summary: stringValue(fields.summary),
    contentMarkdown: stringValue(fields.contentMarkdown),
    contentHtml: stringValue(fields.contentHtml),
    status: stringValue(fields.status),
    beehiivPostId: stringValue(fields.beehiivPostId),
    beehiivUrl: stringValue(fields.beehiivUrl),
    generator: mapValue(fields.generator),
  };
}

async function loadDraft(projectIdValue, accessTokenValue, collectionName, documentId) {
  const document = await firestoreRequest(
    projectIdValue,
    accessTokenValue,
    `${collectionName}/${encodeURIComponent(documentId)}`
  );

  return document ? readDraftFromDocument(document) : null;
}

async function updateDraft(projectIdValue, accessTokenValue, collectionName, documentId, patch) {
  const fields = {};
  if (patch.beehiivPostId !== undefined) fields.beehiivPostId = maybeStringField(patch.beehiivPostId);
  if (patch.beehiivUrl !== undefined) fields.beehiivUrl = maybeStringField(patch.beehiivUrl);
  if (patch.status !== undefined) fields.status = { stringValue: patch.status };
  if (patch.updatedAt !== undefined) fields.updatedAt = { timestampValue: patch.updatedAt };
  if (patch.generator !== undefined) {
    fields.generator = {
      mapValue: {
        fields: {
          ...(patch.generator.model ? { model: { stringValue: patch.generator.model } } : {}),
          ...(patch.generator.openAiResponseId
            ? { openAiResponseId: { stringValue: patch.generator.openAiResponseId } }
            : {}),
          ...(patch.generator.trigger ? { trigger: { stringValue: patch.generator.trigger } } : {}),
          ...(patch.generator.timeZone ? { timeZone: { stringValue: patch.generator.timeZone } } : {}),
          ...(patch.generator.sourceMode
            ? { sourceMode: { stringValue: patch.generator.sourceMode } }
            : {}),
          ...(patch.generator.beehiivPublicationId
            ? { beehiivPublicationId: { stringValue: patch.generator.beehiivPublicationId } }
            : {}),
          ...(patch.generator.beehiivPublishedAt
            ? { beehiivPublishedAt: { timestampValue: patch.generator.beehiivPublishedAt } }
            : {}),
        },
      },
    };
  }

  await firestoreRequest(projectIdValue, accessTokenValue, `${collectionName}/${encodeURIComponent(documentId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
}

async function resolvePublication(apiKey) {
  const response = await beehiivGet('/publications', [], apiKey);
  const publications = Array.isArray(response?.data) ? response.data : [];
  if (!publications.length) {
    throw new Error('No Beehiiv publications were returned for this API key.');
  }

  if (beehiivPublicationId) {
    const match = publications.find((publication) => String(publication?.id) === beehiivPublicationId);
    if (!match) {
      throw new Error('BEEHIIV_PUBLICATION_ID did not match any publication returned by Beehiiv.');
    }
    return {
      id: String(match.id),
      websiteUrl: match.website_url || match.web_url || defaultBeehiivBaseUrl,
    };
  }

  if (beehiivPublicationName) {
    const normalizedName = beehiivPublicationName.toLowerCase();
    const match = publications.find((publication) => String(publication?.name || '').toLowerCase() === normalizedName);
    if (!match) {
      throw new Error('BEEHIIV_PUBLICATION_NAME did not match any publication returned by Beehiiv.');
    }
    return {
      id: String(match.id),
      websiteUrl: match.website_url || match.web_url || defaultBeehiivBaseUrl,
    };
  }

  if (publications.length === 1) {
    return {
      id: String(publications[0].id),
      websiteUrl: publications[0].website_url || publications[0].web_url || defaultBeehiivBaseUrl,
    };
  }

  return {
    id: String(publications[0].id),
    websiteUrl: publications[0].website_url || publications[0].web_url || defaultBeehiivBaseUrl,
  };
}

async function beehiivGet(pathname, params, apiKey) {
  const url = new URL(`https://api.beehiiv.com/v2${pathname}`);
  for (const [key, value] of params) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.append(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Beehiiv API request failed (${response.status} ${response.statusText}) for ${url.pathname}: ${await response.text()}`);
  }

  return response.json();
}

async function createBeehiivPost({ apiKey, publicationId, title, subtitle, bodyHtml, status }) {
  const response = await fetch(`https://api.beehiiv.com/v2/publications/${publicationId}/posts`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      title,
      subtitle,
      body_content: bodyHtml,
      status,
    }),
  });

  if (!response.ok) {
    throw new Error(`Beehiiv create post failed (${response.status} ${response.statusText}): ${await response.text()}`);
  }

  return response.json();
}

function markdownToHtml(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${escapeHtml(paragraph.join(' ').trim())}</p>`);
    paragraph = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (trimmed.startsWith('## ')) {
      flushParagraph();
      blocks.push(`<h2>${escapeHtml(trimmed.slice(3).trim())}</h2>`);
      continue;
    }

    if (trimmed.startsWith('# ')) {
      flushParagraph();
      blocks.push(`<h1>${escapeHtml(trimmed.slice(2).trim())}</h1>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  return blocks.join('\n');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stringValue(field) {
  return cleanText(field?.stringValue);
}

function maybeStringField(value) {
  return value ? { stringValue: value } : { nullValue: null };
}

function mapValue(field) {
  const fields = field?.mapValue?.fields || {};
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, stringValue(value)])
  );
}
