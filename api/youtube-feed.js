const YOUTUBE_CHANNEL_ID = 'UCNhXHBT6Efo1xEjIGKgPNKw';
const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@NagiKumoChillFi';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;

export default async function handler(_request, response) {
  try {
    const upstream = await fetch(FEED_URL, {
      headers: {
        'User-Agent': 'easterling-ms/1.0',
        Accept: 'application/atom+xml, application/xml, text/xml',
      },
    });

    if (!upstream.ok) {
      response.status(upstream.status).json({
        error: `YouTube feed request failed with ${upstream.status}.`,
      });
      return;
    }

    const xml = await upstream.text();
    const videos = parseYouTubeFeedXml(xml).slice(0, 6);

    response.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    response.status(200).json({
      channelId: YOUTUBE_CHANNEL_ID,
      channelUrl: YOUTUBE_CHANNEL_URL,
      videos,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown YouTube feed error.',
    });
  }
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
