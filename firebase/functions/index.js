import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

initializeApp();

const db = getFirestore();

const openAiApiKey = defineSecret('OPENAI_API_KEY');
const newsletterSchedule = defineString('NEWSLETTER_SCHEDULE', {
  default: 'every monday 08:00',
});
const newsletterTimeZone = defineString('NEWSLETTER_TIME_ZONE', {
  default: 'America/New_York',
});

function readEnv(name, fallback = '') {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getIssueDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getHumanDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    dateStyle: 'long',
  }).format(date);
}

function cleanText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function stripHtml(html) {
  return cleanText(
    String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&middot;/gi, ' ')
      .replace(/\s+/g, ' ')
  );
}

function extractTag(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return stripHtml(match?.[1] || '');
}

function extractMetaDescription(html) {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  return cleanText(match?.[1] || '');
}

function summarizeText(text, maxLength = 280) {
  const clean = cleanText(text);
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength - 3).trimEnd()}...`;
}

function extractJsonObject(value) {
  const text = cleanText(value);
  if (!text) {
    throw new Error('OpenAI returned an empty response.');
  }

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

  if (intro) {
    blocks.push(intro);
  }

  for (const section of sections) {
    blocks.push(`## ${section.heading}\n\n${section.body}`);
  }

  if (closing) {
    blocks.push(closing);
  }

  return blocks.join('\n\n').trim();
}

function compactSource(doc) {
  return {
    id: doc.id,
    title: cleanText(doc.title),
    url: cleanText(doc.url),
    notes: cleanText(doc.notes),
    issueDate: cleanText(doc.issueDate),
    summary: cleanText(doc.summary),
  };
}

async function loadQueuedSources(issueDate, maxSources) {
  const snapshot = await db
    .collection(readEnv('NEWSLETTER_SOURCE_COLLECTION', 'newsletter_sources'))
    .where('status', '==', 'queued')
    .limit(Math.max(maxSources * 3, maxSources))
    .get();

  const exactMatches = [];
  const genericMatches = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const source = compactSource({ id: doc.id, ...data });
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

async function loadRepoSources(maxSources) {
  const directories = [
    { dir: path.join(repoRoot, 'posts'), kind: 'post' },
    { dir: path.join(repoRoot, 'blogs'), kind: 'blog' },
  ];
  const sources = [];

  for (const entry of directories) {
    let names = [];
    try {
      names = await readdir(entry.dir);
    } catch {
      continue;
    }

    for (const name of names.filter((value) => value.endsWith('.html'))) {
      const filePath = path.join(entry.dir, name);
      let html;
      try {
        html = await readFile(filePath, 'utf8');
      } catch {
        continue;
      }

      const title = extractTag(html, 'h1') || extractTag(html, 'title') || name;
      const description = extractMetaDescription(html);
      const paragraphs = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi), (match) =>
        stripHtml(match[1])
      ).filter(Boolean);
      const summary = description || summarizeText(paragraphs.slice(0, 3).join(' '));

      sources.push({
        id: `${entry.kind}:${name.replace(/\.html$/i, '')}`,
        title,
        url: '',
        notes: `Use this published ${entry.kind} from the local repo as source material.`,
        issueDate: '',
        summary,
      });
    }
  }

  return sources.slice(0, maxSources);
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

  const instructions = [
    `You write a recurring newsletter for ${newsletterName}.`,
    `The audience is ${audience}.`,
    `Write in a ${tone} voice.`,
    'Use only the provided sources and notes.',
    'Do not invent facts, companies, launches, statistics, or quotes.',
    'Return JSON only with these keys:',
    'title, subjectLine, summary, intro, sections, closing.',
    `sections must be an array with 2 to ${maxSections} items.`,
    'Each section must include heading, body, and sourceUrls.',
  ].join('\n');

  const input = [
    `Issue date: ${issueDate}`,
    `Display date: ${issueLabel}`,
    '',
    'Queued source material:',
    JSON.stringify(sources, null, 2),
  ].join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
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

async function markSourcesDrafted(sources, draftId) {
  if (!sources.length) {
    return;
  }

  const batch = db.batch();
  const collectionName = readEnv('NEWSLETTER_SOURCE_COLLECTION', 'newsletter_sources');

  for (const source of sources) {
    const ref = db.collection(collectionName).doc(source.id);
    batch.set(
      ref,
      {
        status: 'drafted',
        draftId,
        draftedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
}

export const generateScheduledNewsletterDraft = onSchedule(
  {
    schedule: newsletterSchedule,
    timeZone: newsletterTimeZone,
    region: readEnv('FUNCTION_REGION', 'us-central1'),
    timeoutSeconds: 120,
    memory: '512MiB',
    secrets: [openAiApiKey],
  },
  async () => {
    const timeZone = newsletterTimeZone.value();
    const issueDate = getIssueDate(new Date(), timeZone);
    const issueLabel = getHumanDate(new Date(), timeZone);
    const draftCollection = readEnv('NEWSLETTER_DRAFT_COLLECTION', 'newsletterDrafts');
    const draftRef = db.collection(draftCollection).doc(issueDate);

    if ((await draftRef.get()).exists) {
      logger.info('Skipping newsletter generation because a draft already exists.', {
        issueDate,
        draftCollection,
      });
      return;
    }

    const maxSources = Number.parseInt(readEnv('NEWSLETTER_MAX_SOURCES', '5'), 10) || 5;
    const requireSources = readEnv('NEWSLETTER_REQUIRE_SOURCES', 'true') !== 'false';
    const sources = await loadQueuedSources(issueDate, maxSources);

    let resolvedSources = sources;
    let sourceMode = 'firestore';

    if (!resolvedSources.length) {
      resolvedSources = await loadRepoSources(maxSources);
      sourceMode = 'repo';
    }

    if (requireSources && !resolvedSources.length) {
      logger.warn('Skipping newsletter generation because no queued or repo sources were found.', {
        issueDate,
      });
      return;
    }

    const draft = await createDraftFromOpenAi({
      apiKey: openAiApiKey.value(),
      issueDate,
      issueLabel,
      sources: resolvedSources,
    });

    await draftRef.set({
      issueDate,
      issueLabel,
      title: draft.title,
      subjectLine: draft.subjectLine,
      summary: draft.summary,
      intro: draft.intro,
      sections: draft.sections,
      closing: draft.closing,
      contentMarkdown: draft.contentMarkdown,
      sources: resolvedSources.map((source) => ({
        id: source.id,
        title: source.title,
        url: source.url,
        notes: source.notes,
        summary: source.summary || '',
      })),
      sourceCount: resolvedSources.length,
      status: 'ready_for_review',
      approved: false,
      siteUrl: null,
      publishedAt: null,
      generator: {
        model: draft.model,
        openAiResponseId: draft.openAiResponseId,
        schedule: newsletterSchedule.value(),
        timeZone,
        sourceMode,
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (sourceMode === 'firestore') {
      await markSourcesDrafted(resolvedSources, draftRef.id);
    }

    logger.info('Generated newsletter draft.', {
      issueDate,
      draftId: draftRef.id,
      sourceCount: resolvedSources.length,
      sourceMode,
    });
  }
);
