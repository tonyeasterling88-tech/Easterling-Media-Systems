import process from 'node:process';
import { GoogleAuth } from 'google-auth-library';

const issueDate = process.argv[2] || getIssueDate(new Date(), 'America/New_York');
const timeZone = process.env.NEWSLETTER_TIME_ZONE || 'America/New_York';
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const openAiApiKey = process.env.OPENAI_API_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY.');
  process.exit(1);
}

if (!openAiApiKey) {
  console.error('Missing OPENAI_API_KEY.');
  process.exit(1);
}

const sourceCollection = process.env.NEWSLETTER_SOURCE_COLLECTION || 'newsletter_sources';
const draftCollection = process.env.NEWSLETTER_DRAFT_COLLECTION || 'newsletterDrafts';
const maxSources = Number.parseInt(process.env.NEWSLETTER_MAX_SOURCES || '5', 10) || 5;
const requireSources = (process.env.NEWSLETTER_REQUIRE_SOURCES || 'true') !== 'false';
const issueLabel = getHumanDate(new Date(`${issueDate}T12:00:00Z`), timeZone);

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

if (await draftExists(projectId, accessToken, draftCollection, issueDate)) {
  console.error(`Draft ${draftCollection}/${issueDate} already exists. Refusing to overwrite it.`);
  process.exit(1);
}

const sources = await loadQueuedSources({
  projectId,
  accessToken,
  collectionName: sourceCollection,
  issueDate,
  maxSources,
});

if (requireSources && !sources.length) {
  console.error(`No queued sources found for ${issueDate}.`);
  process.exit(1);
}

const draft = await createDraftFromOpenAi({
  apiKey: openAiApiKey,
  issueDate,
  issueLabel,
  sources,
});

await writeDraft({
  projectId,
  accessToken,
  collectionName: draftCollection,
  issueDate,
  issueLabel,
  draft,
  sources,
});

await markSourcesDrafted({
  projectId,
  accessToken,
  collectionName: sourceCollection,
  draftId: issueDate,
  sources,
});

console.log(`Generated draft ${draftCollection}/${issueDate} with ${sources.length} source(s).`);

function readEnv(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function cleanText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function getIssueDate(date, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getHumanDate(date, tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    dateStyle: 'long',
  }).format(date);
}

function extractJsonObject(value) {
  const text = cleanText(value);
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('OpenAI response did not contain a valid JSON object.');
    }
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  }
}

function readResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') {
        parts.push(content.text);
      }
    }
  }

  return parts.join('\n').trim();
}

function normalizeSections(sections) {
  if (!Array.isArray(sections)) {
    return [];
  }

  return sections
    .map((section) => ({
      heading: cleanText(section?.heading),
      body: cleanText(section?.body),
      sourceUrls: Array.isArray(section?.sourceUrls)
        ? section.sourceUrls.map((url) => cleanText(url)).filter(Boolean)
        : [],
    }))
    .filter((section) => section.heading && section.body);
}

function buildMarkdown({ intro, sections, closing }) {
  const blocks = [];
  if (intro) blocks.push(intro);
  for (const section of sections) {
    blocks.push(`## ${section.heading}\n\n${section.body}`);
  }
  if (closing) blocks.push(closing);
  return blocks.join('\n\n').trim();
}

async function firestoreRequest(projectIdValue, accessTokenValue, path, options = {}) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectIdValue}/databases/(default)/documents/${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${accessTokenValue}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Firestore request failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function draftExists(projectIdValue, accessTokenValue, collectionName, documentId) {
  return Boolean(
    await firestoreRequest(
      projectIdValue,
      accessTokenValue,
      `${collectionName}/${encodeURIComponent(documentId)}`
    )
  );
}

async function loadQueuedSources({ projectId, accessToken, collectionName, issueDate, maxSources }) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: collectionName }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'EQUAL',
              value: { stringValue: 'queued' },
            },
          },
          limit: Math.max(maxSources * 3, maxSources),
        },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Unable to query newsletter sources: ${response.status} ${body}`);
  }

  const rows = await response.json();
  const exactMatches = [];
  const genericMatches = [];

  for (const row of rows) {
    if (!row.document) continue;
    const fields = row.document.fields || {};
    const source = {
      id: row.document.name.split('/').pop(),
      title: stringValue(fields.title),
      url: stringValue(fields.url),
      notes: stringValue(fields.notes),
      summary: stringValue(fields.summary),
      issueDate: stringValue(fields.issueDate),
    };

    if (source.issueDate && source.issueDate !== issueDate) {
      continue;
    }

    if (source.issueDate === issueDate) {
      exactMatches.push(source);
    } else {
      genericMatches.push(source);
    }
  }

  return [...exactMatches, ...genericMatches].slice(0, maxSources);
}

async function createDraftFromOpenAi({ apiKey, issueDate, issueLabel, sources }) {
  const newsletterName = readEnv('NEWSLETTER_NAME', 'Easterling Media & Systems');
  const audience = readEnv(
    'NEWSLETTER_AUDIENCE',
    'founders, operators, and technically curious builders'
  );
  const tone = readEnv(
    'NEWSLETTER_TONE',
    'clear, grounded, concise, and insightful without hype'
  );
  const model = readEnv('OPENAI_MODEL', 'gpt-5-mini');
  const maxSections = Number.parseInt(readEnv('NEWSLETTER_MAX_SECTIONS', '4'), 10) || 4;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: [
        `You write a recurring newsletter for ${newsletterName}.`,
        `The audience is ${audience}.`,
        `Write in a ${tone} voice.`,
        'Use only the provided sources and notes.',
        'Do not invent facts, companies, launches, statistics, or quotes.',
        'Return JSON only with these keys:',
        'title, subjectLine, summary, intro, sections, closing.',
        `sections must be an array with 2 to ${maxSections} items.`,
        'Each section must include heading, body, and sourceUrls.',
      ].join('\n'),
      input: [
        `Issue date: ${issueDate}`,
        `Display date: ${issueLabel}`,
        '',
        'Queued source material:',
        JSON.stringify(sources, null, 2),
      ].join('\n'),
      max_output_tokens: 2500,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed (${response.status} ${response.statusText}): ${body}`);
  }

  const payload = await response.json();
  const parsed = extractJsonObject(readResponseText(payload));
  const sections = normalizeSections(parsed.sections);

  if (!sections.length) {
    throw new Error('OpenAI returned no usable newsletter sections.');
  }

  return {
    title: cleanText(parsed.title) || `${newsletterName} - ${issueLabel}`,
    subjectLine: cleanText(parsed.subjectLine) || cleanText(parsed.title),
    summary: cleanText(parsed.summary),
    intro: cleanText(parsed.intro),
    sections,
    closing: cleanText(parsed.closing),
    contentMarkdown: buildMarkdown({
      intro: cleanText(parsed.intro),
      sections,
      closing: cleanText(parsed.closing),
    }),
    openAiResponseId: cleanText(payload.id),
    model,
  };
}

async function writeDraft({
  projectId,
  accessToken,
  collectionName,
  issueDate,
  issueLabel,
  draft,
  sources,
}) {
  const path = `${collectionName}/${encodeURIComponent(issueDate)}`;
  const fields = {
    issueDate: { stringValue: issueDate },
    issueLabel: { stringValue: issueLabel },
    title: { stringValue: draft.title },
    subjectLine: { stringValue: draft.subjectLine },
    summary: { stringValue: draft.summary },
    intro: { stringValue: draft.intro },
    closing: { stringValue: draft.closing },
    contentMarkdown: { stringValue: draft.contentMarkdown },
    sourceCount: { integerValue: String(sources.length) },
    status: { stringValue: 'ready_for_review' },
    approved: { booleanValue: false },
    beehiivPostId: { nullValue: null },
    beehiivUrl: { nullValue: null },
    sources: {
      arrayValue: {
        values: sources.map((source) => ({
          mapValue: {
            fields: {
              id: { stringValue: source.id },
              title: { stringValue: source.title },
              url: source.url ? { stringValue: source.url } : { nullValue: null },
              notes: source.notes ? { stringValue: source.notes } : { nullValue: null },
            },
          },
        })),
      },
    },
    sections: {
      arrayValue: {
        values: draft.sections.map((section) => ({
          mapValue: {
            fields: {
              heading: { stringValue: section.heading },
              body: { stringValue: section.body },
              sourceUrls: {
                arrayValue: {
                  values: section.sourceUrls.map((url) => ({ stringValue: url })),
                },
              },
            },
          },
        })),
      },
    },
    generator: {
      mapValue: {
        fields: {
          model: { stringValue: draft.model },
          openAiResponseId: draft.openAiResponseId
            ? { stringValue: draft.openAiResponseId }
            : { nullValue: null },
          trigger: { stringValue: 'manual-script' },
          timeZone: { stringValue: timeZone },
        },
      },
    },
    createdAt: { timestampValue: new Date().toISOString() },
    updatedAt: { timestampValue: new Date().toISOString() },
  };

  await firestoreRequest(projectId, accessToken, path, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
}

async function markSourcesDrafted({ projectId, accessToken, collectionName, draftId, sources }) {
  const writes = sources.map((source) => ({
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${collectionName}/${source.id}`,
      fields: {
        status: { stringValue: 'drafted' },
        draftId: { stringValue: draftId },
        draftedAt: { timestampValue: new Date().toISOString() },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    },
    updateMask: {
      fieldPaths: ['status', 'draftId', 'draftedAt', 'updatedAt'],
    },
  }));

  if (!writes.length) {
    return;
  }

  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to mark sources drafted: ${response.status} ${body}`);
  }
}

function stringValue(field) {
  return cleanText(field?.stringValue);
}
