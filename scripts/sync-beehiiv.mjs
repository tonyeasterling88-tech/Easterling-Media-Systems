import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'assets', 'beehiiv-posts.json');
const apiBaseUrl = 'https://api.beehiiv.com/v2';
const defaultWebsiteUrl = 'https://easterling-ms-newsletter.beehiiv.com';
const publicRequestHeaders = {
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
  'User-Agent': 'Easterling-MS Beehiiv Sync/1.0 (+https://github.com/tonyeasterling88-tech/Easterling-Media-Systems)',
};

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

async function fetchText(url) {
  const response = await fetch(url, {
    headers: publicRequestHeaders,
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status} ${response.statusText}) for ${url}`);
  }

  return response.text();
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
  return `${clean.slice(0, maxLength - 3).trimEnd()}...`;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseDateValue(value) {
  if (value === undefined || value === null || value === '') return null;

  let parsed = null;
  if (typeof value === 'number') {
    parsed = new Date(value < 1_000_000_000_000 ? value * 1000 : value);
  } else if (/^\d+$/.test(String(value).trim())) {
    const numericValue = Number(value);
    parsed = new Date(numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue);
  } else {
    parsed = new Date(value);
  }

  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtmlEntities(value) {
  const decoded = String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, digits) => String.fromCharCode(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  if (!/[ÃÂâ]/.test(decoded)) {
    return decoded;
  }

  try {
    const repaired = Buffer.from(decoded, 'latin1').toString('utf8');
    return repaired.includes('\uFFFD') ? decoded : repaired;
  } catch {
    return decoded;
  }
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
  const publishedAt = parseDateValue(pickPublishedAt(post));
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
      ? post.authors
          .map((author) => (typeof author === 'string' ? author : author?.name))
          .filter(Boolean)
      : [],
    tags: Array.isArray(post?.content_tags)
      ? post.content_tags.map((tag) => tag?.name || tag).filter(Boolean)
      : [],
    html,
  };
}

function compareIssuesDescending(left, right) {
  return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
}

function extractTagAttribute(tag, attribute) {
  const pattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i');
  return tag.match(pattern)?.[1] || '';
}

function extractMetaContent(html, key) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of metaTags) {
    const property = extractTagAttribute(tag, 'property');
    const name = extractTagAttribute(tag, 'name');
    if (property === key || name === key) {
      return decodeHtmlEntities(extractTagAttribute(tag, 'content'));
    }
  }
  return '';
}

function extractCanonicalUrl(html) {
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    if (extractTagAttribute(tag, 'rel') === 'canonical') {
      return extractTagAttribute(tag, 'href');
    }
  }
  return '';
}

function extractDocumentTitle(html) {
  const match = html.match(/<title>([\s\S]*?)<\/title>/i);
  return decodeHtmlEntities(match?.[1] || '').trim();
}

function extractJsonLd(html) {
  const matches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const objects = [];

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        objects.push(...parsed);
      } else if (parsed) {
        objects.push(parsed);
      }
    } catch {
      // Ignore malformed JSON-LD blocks and keep scanning.
    }
  }

  return objects;
}

function extractArticleSchema(html) {
  return extractJsonLd(html).find((entry) => {
    const type = entry?.['@type'];
    return type === 'Article' || (Array.isArray(type) && type.includes('Article'));
  }) || null;
}

function derivePublicationNameFromTitle(title) {
  return title.replace(/^Home\s*\|\s*/i, '').trim();
}

async function readExistingPayload() {
  try {
    return JSON.parse(await readFile(outputPath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveWebsiteUrl(existingPayload) {
  return (
    optionalEnv('BEEHIIV_WEBSITE_URL') ||
    existingPayload?.publication?.websiteUrl ||
    defaultWebsiteUrl
  );
}

function normalizePublicIssue(postHtml, fallbackUrl) {
  const article = extractArticleSchema(postHtml);
  const canonicalUrl = extractCanonicalUrl(postHtml) || fallbackUrl;
  const url = new URL(canonicalUrl, fallbackUrl);
  const slug = url.pathname.split('/').filter(Boolean).pop() || slugify(extractDocumentTitle(postHtml)) || `issue-${Date.now()}`;
  const title =
    extractMetaContent(postHtml, 'og:title') ||
    extractDocumentTitle(postHtml) ||
    article?.headline ||
    'Untitled issue';
  const excerpt =
    extractMetaContent(postHtml, 'description') ||
    article?.description ||
    '';
  const authorNames = Array.isArray(article?.author)
    ? article.author
        .map((author) => (typeof author === 'string' ? author : author?.name))
        .filter(Boolean)
    : (typeof article?.author?.name === 'string' ? [article.author.name] : []);

  return {
    id: String(article?.identifier || slug),
    slug,
    title: decodeHtmlEntities(title),
    subtitle: '',
    excerpt: summarize(excerpt),
    publishedAt: parseDateValue(article?.datePublished),
    webUrl: url.toString(),
    thumbnailUrl:
      extractMetaContent(postHtml, 'og:image') ||
      article?.image?.url ||
      article?.image ||
      '',
    authors: authorNames,
    tags: [],
    html: excerpt ? `<p>${escapeHtml(summarize(excerpt, 500))}</p>` : '',
  };
}

async function fetchPublicIssues(publicationWebsiteUrl) {
  const homeHtml = await fetchText(publicationWebsiteUrl);
  const publicationUrl = new URL('/', publicationWebsiteUrl).toString().replace(/\/$/, '');
  const publicationName =
    extractMetaContent(homeHtml, 'og:site_name') ||
    derivePublicationNameFromTitle(extractDocumentTitle(homeHtml)) ||
    'Beehiiv Publication';

  const postUrls = Array.from(
    new Set(
      Array.from(homeHtml.matchAll(/href=["'](\/p\/[^"'#?]+)["']/gi), (match) =>
        new URL(match[1], publicationUrl).toString()
      )
    )
  );

  if (!postUrls.length) {
    throw new Error(`No public Beehiiv posts were found at ${publicationUrl}`);
  }

  const issues = (await Promise.all(
    postUrls.map(async (postUrl) => normalizePublicIssue(await fetchText(postUrl), postUrl))
  ))
    .filter((issue) => issue.publishedAt)
    .sort(compareIssuesDescending);

  if (!issues.length) {
    throw new Error(`No published public Beehiiv posts were found at ${publicationUrl}`);
  }

  return {
    publication: {
      id: '',
      name: publicationName,
      websiteUrl: publicationUrl,
    },
    issues,
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
      throw new Error('BEEHIIV_PUBLICATION_ID did not match any publication returned by Beehiiv.');
    }
    return match;
  }

  if (publicationName) {
    const match = publications.find((publication) =>
      String(publication?.name || '').toLowerCase() === publicationName
    );
    if (!match) {
      throw new Error('BEEHIIV_PUBLICATION_NAME did not match any publication returned by Beehiiv.');
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

  return issues.map(normalizeIssue).filter((issue) => issue.publishedAt).sort(compareIssuesDescending);
}

async function resolveIssues() {
  const existingPayload = await readExistingPayload();
  const publicationWebsiteUrl = resolveWebsiteUrl(existingPayload);
  const apiKey = optionalEnv('BEEHIIV_API_KEY');

  if (apiKey) {
    try {
      const publication = await resolvePublication(apiKey);
      const issues = await fetchAllIssues(publication.id, apiKey);
      if (issues.length) {
        return {
          publication: {
            id: String(publication?.id || ''),
            name: publication?.name || '',
            websiteUrl: publication?.website_url || publication?.web_url || publicationWebsiteUrl,
          },
          issues,
          source: 'api',
        };
      }

      console.warn('Beehiiv API returned no published issues. Falling back to public website scraping.');
    } catch (error) {
      console.warn(`${error.message} Falling back to public website scraping.`);
    }
  } else {
    console.warn('BEEHIIV_API_KEY is not set. Falling back to public website scraping.');
  }

  const publicData = await fetchPublicIssues(publicationWebsiteUrl);
  return {
    ...publicData,
    source: 'public-site',
  };
}

async function main() {
  const { publication, issues, source } = await resolveIssues();

  const payload = {
    updatedAt: new Date().toISOString(),
    publication: {
      id: String(publication?.id || ''),
      name: publication?.name || '',
      websiteUrl: publication?.websiteUrl || publication?.web_url || '',
    },
    issues,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${issues.length} Beehiiv issue(s) from ${source} to ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
