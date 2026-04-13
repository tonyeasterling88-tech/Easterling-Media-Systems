import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'assets', 'youtube-videos.json');

const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCNhXHBT6Efo1xEjIGKgPNKw';
const channelUrl = process.env.YOUTUBE_CHANNEL_URL || 'https://www.youtube.com/@NagiKumoChillFi';
const maxVideos = Number.parseInt(process.env.YOUTUBE_MAX_VIDEOS || '6', 10);
const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

async function main() {
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
  let videos = parseYouTubeFeedXml(xml).slice(0, maxVideos);

  if (!videos.length) {
    videos = (await fetchVideosTab(channelUrl)).slice(0, maxVideos);
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    channel: {
      id: channelId,
      url: channelUrl,
      feedUrl,
    },
    videos,
  };

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Synced ${videos.length} YouTube videos to ${outputPath}`);
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
