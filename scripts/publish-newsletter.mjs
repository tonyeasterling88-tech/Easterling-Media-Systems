import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { GoogleAuth } from 'google-auth-library';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const archivePath = path.join(repoRoot, 'assets', 'newsletter-issues.json');

await loadEnvFiles([
  path.join(repoRoot, '.env.local'),
  path.join(repoRoot, 'firebase', 'functions', '.env.local'),
]);

const issueDate = process.argv[2] || getIssueDate(new Date(), 'America/New_York');
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const draftCollection = process.env.NEWSLETTER_DRAFT_COLLECTION || 'newsletterDrafts';

if (!projectId || !clientEmail || !privateKey) {
  console.error('Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY.');
  process.exit(1);
}

const auth = new GoogleAuth({
  projectId,
  credentials: { client_email: clientEmail, private_key: privateKey },
  scopes: ['https://www.googleapis.com/auth/datastore'],
});
const authClient = await auth.getClient();
const tokenResponse = await authClient.getAccessToken();
const accessToken = tokenResponse.token || tokenResponse;

if (!accessToken) {
  console.error('Unable to obtain a Firestore access token.');
  process.exit(1);
}

const document = await firestoreRequest(
  `${draftCollection}/${encodeURIComponent(issueDate)}`,
  accessToken
);

if (!document) {
  console.error(`Draft ${draftCollection}/${issueDate} was not found.`);
  process.exit(1);
}

const draft = readDraft(document);
if (!draft.approved && draft.status !== 'approved') {
  console.error(`Draft ${draftCollection}/${issueDate} is not approved. Approve it in Firestore before publishing.`);
  process.exit(1);
}

if (draft.status === 'published' || draft.siteUrl) {
  console.error(`Draft ${draftCollection}/${issueDate} already appears to be published on the site.`);
  process.exit(1);
}

const archive = JSON.parse(await fs.readFile(archivePath, 'utf8'));
const title = draft.title || draft.subjectLine || `Newsletter ${issueDate}`;
const slug = uniqueSlug(slugify(title), archive.issues || []);
const publishedAt = new Date(`${issueDate}T12:00:00.000Z`).toISOString();
const relativeUrl = `newsletters.html?issue=${encodeURIComponent(slug)}#newsletter-reader`;
const siteUrl = `https://www.easterlingmediasystems.com/${relativeUrl}`;

if ((archive.issues || []).some((issue) => String(issue.publishedAt || '').startsWith(issueDate))) {
  console.error(`The local archive already contains an issue dated ${issueDate}.`);
  process.exit(1);
}

const issue = {
  id: `issue_${issueDate}`,
  slug,
  title,
  subtitle: draft.summary || '',
  excerpt: draft.summary || firstParagraph(draft.contentMarkdown),
  publishedAt,
  webUrl: relativeUrl,
  thumbnailUrl: '',
  authors: ['Anthony Easterling'],
  tags: [],
  html: draft.contentHtml || markdownToHtml(draft.contentMarkdown),
};

archive.updatedAt = new Date().toISOString();
archive.publication = {
  name: 'Easterling Media & Systems Newsletter',
  websiteUrl: 'https://www.easterlingmediasystems.com/newsletters.html',
};
archive.issues = [issue, ...(archive.issues || [])]
  .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

await fs.writeFile(archivePath, `${JSON.stringify(archive, null, 2)}\n`);

await firestoreRequest(
  `${draftCollection}/${encodeURIComponent(issueDate)}?updateMask.fieldPaths=status&updateMask.fieldPaths=siteUrl&updateMask.fieldPaths=publishedAt&updateMask.fieldPaths=updatedAt`,
  accessToken,
  {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        status: { stringValue: 'published' },
        siteUrl: { stringValue: siteUrl },
        publishedAt: { timestampValue: publishedAt },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    }),
  }
);

console.log(`Published ${draftCollection}/${issueDate} to ${relativeUrl}.`);

async function loadEnvFiles(paths) {
  for (const filePath of paths) {
    let raw;
    try { raw = await fs.readFile(filePath, 'utf8'); } catch { continue; }
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      if (!key || process.env[key]) continue;
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

async function firestoreRequest(documentPath, token, options = {}) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore request failed (${response.status}): ${await response.text()}`);
  return response.json();
}

function readDraft(documentValue) {
  const fields = documentValue?.fields || {};
  return {
    title: fields.title?.stringValue || '',
    subjectLine: fields.subjectLine?.stringValue || '',
    summary: fields.summary?.stringValue || '',
    contentMarkdown: fields.contentMarkdown?.stringValue || '',
    contentHtml: fields.contentHtml?.stringValue || '',
    status: fields.status?.stringValue || '',
    approved: Boolean(fields.approved?.booleanValue),
    siteUrl: fields.siteUrl?.stringValue || '',
  };
}

function getIssueDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || issueDate;
}

function uniqueSlug(base, issues) {
  const used = new Set(issues.map((issue) => issue.slug));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function firstParagraph(markdown) {
  return String(markdown || '')
    .split(/\n\s*\n/)
    .map((block) => block.replace(/^#+\s*/, '').trim())
    .find(Boolean) || '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function markdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listType = '';

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listType) html.push(`</${listType}>`);
    listType = '';
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flushParagraph(); closeList(); continue; }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph(); closeList();
      const level = Math.min(heading[1].length + 1, 4);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = unordered ? 'ul' : 'ol';
      if (listType !== nextType) { closeList(); listType = nextType; html.push(`<${listType}>`); }
      html.push(`<li>${inlineMarkdown((unordered || ordered)[1])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line);
  }
  flushParagraph(); closeList();
  return html.join('\n');
}
