import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'assets', 'youtube-videos.json');
const envFiles = [
  path.join(repoRoot, '.env.local'),
  path.join(repoRoot, 'firebase', 'functions', '.env.local'),
];

await loadEnvFiles();

const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCNhXHBT6Efo1xEjIGKgPNKw';
const channelUrl = process.env.YOUTUBE_CHANNEL_URL || 'https://www.youtube.com/@NagiKumoChillFi';
const maxVideos = Number.parseInt(process.env.YOUTUBE_MAX_VIDEOS || '6', 10);
const youtubeApiKey = process.env.YOUTUBE_API_KEY?.trim() || '';
const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

async function main() {
  const existingPayload = await readExistingPayload();
  let source = 'youtube-data-api';
  let videos = [];

  if (youtubeApiKey) {
    try {
      videos = (await fetchYouTubeApiVideos()).slice(0, maxVideos);
    } catch (error) {
      console.warn(`${error.message} Falling back to YouTube RSS.`);
    }
  } else {
    console.warn('YOUTUBE_API_KEY is not set. Falling back to YouTube RSS.');
  }

  if (!videos.length) {
    source = 'youtube-rss';
    try {
      videos = (await fetchFeedVideos()).slice(0, maxVideos);
    } catch (error) {
      console.warn(`${error.message} Falling back to the public videos page.`);
    }
  }

  if (!videos.length) {
    source = 'youtube-videos-page';
    try {
      videos = (await fetchVideosTab(channelUrl)).slice(0, maxVideos);
    } catch (error) {
      console.warn(`${error.message} Unable to refresh YouTube videos from public sources.`);
    }
  }

  if (!videos.length) {
    if (Array.isArray(existingPayload?.videos) && existingPayload.videos.length) {
      console.warn(`No YouTube videos could be refreshed. Leaving ${path.relative(repoRoot, outputPath)} unchanged.`);
      return;
    }

    console.warn('No YouTube videos could be refreshed and no existing payload was found. Writing an empty feed.');
  }

  videos = mergeExistingVideoMetadata(videos, existingPayload?.videos);

  if (hasSameVideoPayload(videos, existingPayload?.videos)) {
    console.log(`No YouTube video changes found. Leaving ${path.relative(repoRoot, outputPath)} unchanged.`);
    return;
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    channel: {
      id: channelId,
      url: channelUrl,
      feedUrl,
      source,
    },
    videos,
  };

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Synced ${videos.length} YouTube videos from ${source} to ${outputPath}`);
}

function hasSameVideoPayload(videos, existingVideos) {
  if (!Array.isArray(videos) || !Array.isArray(existingVideos)) return false;
  if (videos.length !== existingVideos.length) return false;

  return videos.every((video, index) => {
    const existing = existingVideos[index] || {};
    return (
      video.videoId === existing.videoId &&
      video.title === existing.title &&
      video.published === existing.published &&
      video.author === existing.author &&
      video.link === existing.link
    );
  });
}

function mergeExistingVideoMetadata(videos, existingVideos) {
  if (!Array.isArray(videos) || !Array.isArray(existingVideos) || !existingVideos.length) {
    return videos;
  }

  const existingById = new Map(existingVideos.map((video) => [video?.videoId, video]).filter(([videoId]) => videoId));

  return videos.map((video) => {
    const existing = existingById.get(video.videoId);
    if (!existing) return video;

    return {
      ...video,
      published: video.published || existing.published || '',
      author: video.author || existing.author || '',
    };
  });
}

async function readExistingPayload() {
  try {
    return JSON.parse(await fs.readFile(outputPath, 'utf8'));
  } catch {
    return null;
  }
}

async function loadEnvFiles() {
  for (const filePath of envFiles) {
    let fileContents = '';

    try {
      fileContents = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    for (const rawLine of fileContents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) continue;

      const key = line.slice(0, separatorIndex).trim();
      if (!key || process.env[key]) continue;

      let value = line.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value.replace(/\\n/g, '\n');
    }
  }
}

async function fetchYouTubeApiVideos() {
  const apiUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  apiUrl.searchParams.set('key', youtubeApiKey);
  apiUrl.searchParams.set('channelId', channelId);
  apiUrl.searchParams.set('part', 'snippet');
  apiUrl.searchParams.set('order', 'date');
  apiUrl.searchParams.set('maxResults', String(Math.max(maxVideos, 6)));
  apiUrl.searchParams.set('type', 'video');

  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'easterling-ms-sync/1.0',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YouTube Data API request failed: ${response.status} ${body}`);
  }

  const payload = await response.json();
  const items = Array.isArray(payload?.items) ? payload.items : [];

  return items
    .map((item) => {
      const videoId = item?.id?.videoId || '';
      const snippet = item?.snippet || {};
      if (!videoId) return null;

      return {
        videoId,
        title: snippet.title || 'Untitled video',
        published: snippet.publishedAt || '',
        author: snippet.channelTitle || 'NagiKumo ChillFi',
        link: `https://www.youtube.com/watch?v=${videoId}`,
      };
    })
    .filter(Boolean);
}

async function fetchFeedVideos() {
  const response = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'easterling-ms-sync/1.0',
      Accept: 'application/atom+xml, application/xml, text/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`YouTube feed request failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  return parseYouTubeFeedXml(xml);
}

async function fetchVideosTab(baseChannelUrl) {
  const videosUrl = `${baseChannelUrl.replace(/\/$/, '')}/videos`;
  const response = await fetch(videosUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`YouTube videos page request failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const matches = [...html.matchAll(/"videoId":"([^"]+)"[\s\S]{0,2500}?"title":\{"runs":\[\{"text":"([^"]+)"/g)];
  const seen = new Set();

  return matches
    .map((match) => {
      const videoId = match[1];
      const title = decodeJsonText(match[2]);

      if (!videoId || seen.has(videoId)) {
        return null;
      }

      seen.add(videoId);

      return {
        videoId,
        title: title || 'Untitled video',
        published: '',
        author: 'NagiKumo ChillFi',
        link: `https://www.youtube.com/watch?v=${videoId}`,
      };
    })
    .filter(Boolean);
}

function parseYouTubeFeedXml(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)];

  return entries
    .map((match) => parseEntry(match[1]))
    .filter(Boolean);
}

function parseEntry(entryXml) {
  const videoId = readTag(entryXml, 'yt:videoId');
  const title = decodeXml(readTag(entryXml, 'title'));
  const published = readTag(entryXml, 'published');
  const author = decodeXml(readTag(entryXml, 'name')) || 'NagiKumoChillFi';
  const link = readLinkHref(entryXml) || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');

  if (!videoId || !link) {
    return null;
  }

  return {
    videoId,
    title: title || 'Untitled video',
    published: published || '',
    author,
    link,
  };
}

function readTag(xml, tagName) {
  const pattern = new RegExp(`<${escapeForRegex(tagName)}>([\\s\\S]*?)<\\/${escapeForRegex(tagName)}>`, 'i');
  const match = xml.match(pattern);
  return match?.[1]?.trim() || '';
}

function readLinkHref(xml) {
  const match = xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return decodeXml(match?.[1] || '');
}

function escapeForRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function decodeJsonText(value) {
  return String(value || '')
    .replace(/\\u0026/g, '&')
    .replace(/\\u003d/g, '=')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
