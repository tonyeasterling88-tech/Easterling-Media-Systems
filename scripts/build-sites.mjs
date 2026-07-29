import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const assetsOut = path.join(dist, 'assets');
const serverOut = path.join(dist, 'server');

const rootFiles = [
  'CNAME',
  'google35557eb3ef03db9e.html',
  'robots.txt',
  'sitemap.xml',
  'styles.css',
];

const publicDirectories = ['assets', 'blogs', 'Newsletters', 'posts'];

await rm(dist, { recursive: true, force: true });
await mkdir(assetsOut, { recursive: true });
await mkdir(serverOut, { recursive: true });
await cp(path.join(root, '.openai'), path.join(dist, '.openai'), { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.html')) {
    await cp(path.join(root, entry.name), path.join(assetsOut, entry.name));
  }
}

for (const file of rootFiles) {
  await cp(path.join(root, file), path.join(assetsOut, file));
}

for (const directory of publicDirectories) {
  await cp(path.join(root, directory), path.join(assetsOut, directory), {
    recursive: true,
  });
}

const worker = `const channelId = 'UCNhXHBT6Efo1xEjIGKgPNKw';
const channelUrl = 'https://www.youtube.com/@NagiKumoChillFi';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/youtube') {
      try {
        const feedResponse = await fetch(
          'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId,
          { headers: { Accept: 'application/atom+xml, application/xml, text/xml' } }
        );

        if (!feedResponse.ok) throw new Error('YouTube RSS returned ' + feedResponse.status);

        const videos = parseFeed(await feedResponse.text()).slice(0, 12);
        if (!videos.length) throw new Error('YouTube RSS returned no videos');

        return Response.json(
          {
            updatedAt: new Date().toISOString(),
            channel: { id: channelId, url: channelUrl, source: 'youtube-rss' },
            videos,
          },
          {
            headers: {
              'Cache-Control': 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400',
            },
          }
        );
      } catch (_error) {
        url.pathname = '/assets/youtube-videos.json';
        return env.ASSETS.fetch(new Request(url, request));
      }
    }

    return env.ASSETS.fetch(request);
  },
};

function parseFeed(xml) {
  return [...xml.matchAll(/<entry>([\\s\\S]*?)<\\/entry>/gi)]
    .map((match) => {
      const entry = match[1];
      const videoId = readTag(entry, 'yt:videoId');
      if (!videoId) return null;

      return {
        videoId,
        title: decodeXml(readTag(entry, 'title')) || 'Untitled video',
        published: readTag(entry, 'published'),
        author: decodeXml(readTag(entry, 'name')) || 'NagiKumo ChillFi',
        link: 'https://www.youtube.com/watch?v=' + videoId,
      };
    })
    .filter(Boolean);
}

function readTag(xml, tagName) {
  const match = xml.match(new RegExp('<' + tagName + '>([\\\\s\\\\S]*?)<\\\\/' + tagName + '>', 'i'));
  return match?.[1]?.trim() || '';
}

function decodeXml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
`;

await writeFile(path.join(serverOut, 'index.js'), worker, 'utf8');

console.log('Sites build ready in dist/');
