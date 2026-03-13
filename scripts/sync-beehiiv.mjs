import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'assets', 'beehiiv-posts.json');
const apiBaseUrl = 'https://api.beehiiv.com/v2';

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name) {
  return process.env[name]?.trim() || '';
}

async function apiGet(pathname, params, apiKey) {
  const url = new URL(`${apiBaseUrl}${pathname}`);
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
    const body = await response.text();
    throw new Error(`Beehiiv API request failed (${response.status} ${response.statusText}) for ${url.pathname}: ${body}`);
  }

  return response.json();
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarize(text, maxLength = 220) {
  const clean = stripHtml(text);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pickHtml(post) {
  return (
    post?.content?.free?.web ||
    post?.free_web_content?.web ||
    post?.content?.web ||
    ''
  );
}

function pickPublishedAt(post) {
  return (
    post?.publish_date ||
    post?.displayed_date ||
    post?.created ||
    post?.created_at ||
    null
  );
}

function normalizeIssue(post) {
  const html = pickHtml(post);
  const publishedAt = pickPublishedAt(post);
  const title = post?.title || 'Untitled issue';
  const slug = post?.slug || slugify(title) || `issue-${post?.id || Date.now()}`;
  const excerptSource =
    post?.preview_text ||
    post?.subtitle ||
    post?.meta_default_description ||
    html;

  return {
    id: String(post?.id || slug),
    slug,
    title,
    subtitle: post?.subtitle || '',
    excerpt: summarize(excerptSource),
    publishedAt,
    webUrl: post?.web_url || post?.url || '',
    thumbnailUrl: post?.thumbnail_url || post?.cover_image_url || '',
    authors: Array.isArray(post?.authors)
      ? post.authors.map((author) => author?.name).filter(Boolean)
      : [],
    tags: Array.isArray(post?.content_tags)
      ? post.content_tags.map((tag) => tag?.name || tag).filter(Boolean)
      : [],
    html,
  };
}

async function resolvePublication(apiKey) {
  const publicationId = optionalEnv('BEEHIIV_PUBLICATION_ID');
  const publicationName = optionalEnv('BEEHIIV_PUBLICATION_NAME').toLowerCase();
  const response = await apiGet('/publications', [], apiKey);
  const publications = Array.isArray(response?.data) ? response.data : [];

  if (!publications.length) {
    throw new Error('No Beehiiv publications were returned for this API key.');
  }

  if (publicationId) {
    const match = publications.find((publication) => String(publication?.id) === publicationId);
    if (!match) {
      throw new Error(`BEEHIIV_PUBLICATION_ID did not match any publication returned by Beehiiv.`);
    }
    return match;
  }

  if (publicationName) {
    const match = publications.find((publication) =>
      String(publication?.name || '').toLowerCase() === publicationName
    );
    if (!match) {
      throw new Error(`BEEHIIV_PUBLICATION_NAME did not match any publication returned by Beehiiv.`);
    }
    return match;
  }

  if (publications.length === 1) {
    return publications[0];
  }

  const names = publications.map((publication) => `${publication?.name || 'Unnamed'} (${publication?.id || 'no-id'})`);
  throw new Error(`Multiple Beehiiv publications found. Set BEEHIIV_PUBLICATION_ID or BEEHIIV_PUBLICATION_NAME. Available publications: ${names.join(', ')}`);
}

async function fetchAllIssues(publicationId, apiKey) {
  const issues = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await apiGet(
      `/publications/${publicationId}/posts`,
      [
        ['limit', '100'],
        ['page', String(page)],
        ['status', 'confirmed'],
        ['direction', 'desc'],
        ['order_by', 'publish_date'],
        ['expand[]', 'free_web_content'],
      ],
      apiKey
    );

    issues.push(...(Array.isArray(response?.data) ? response.data : []));
    totalPages = Number(response?.total_pages || 1);
    page += 1;
  }

  return issues.map(normalizeIssue).filter((issue) => issue.publishedAt);
}

async function main() {
  const apiKey = requiredEnv('BEEHIIV_API_KEY');
  const publication = await resolvePublication(apiKey);
  const issues = await fetchAllIssues(publication.id, apiKey);

  const payload = {
    updatedAt: new Date().toISOString(),
    publication: {
      id: String(publication?.id || ''),
      name: publication?.name || '',
      websiteUrl: publication?.website_url || publication?.web_url || '',
    },
    issues,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${issues.length} Beehiiv issue(s) to ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
