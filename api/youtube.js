export default async function handler(req, res) {
  // Add caching headers to prevent hitting YouTube API quota limits on every single page view.
  // Cache publicly for 1 hour (3600 seconds) on Vercel's global CDN edge networks, 
  // and allow stale-while-revalidate for 5 minutes (300 seconds).
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCNhXHBT6Efo1xEjIGKgPNKw';
  const channelUrl = process.env.YOUTUBE_CHANNEL_URL || 'https://www.youtube.com/@NagiKumoChillFi';
  const maxVideos = 6;
  const youtubeApiKey = process.env.YOUTUBE_API_KEY || '';

  let videos = [];
  let source = 'youtube-data-api';

  if (youtubeApiKey) {
    try {
      videos = await fetchYouTubeApiVideos(youtubeApiKey, channelId, maxVideos);
    } catch (error) {
      console.warn('YouTube Data API failed, falling back to RSS:', error.message);
    }
  }

  if (!videos.length) {
    source = 'youtube-rss';
    try {
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      videos = await fetchFeedVideos(feedUrl, maxVideos);
    } catch (error) {
      console.warn('YouTube RSS failed, falling back to scraping page:', error.message);
    }
  }

  if (!videos.length) {
    source = 'youtube-videos-page';
    try {
      videos = await fetchVideosTab(channelUrl, maxVideos);
    } catch (error) {
      console.warn('YouTube page scraping failed:', error.message);
    }
  }

  res.status(200).json({
    updatedAt: new Date().toISOString(),
    channel: {
      id: channelId,
      url: channelUrl,
      source,
    },
    videos,
  });
}

async function fetchYouTubeApiVideos(apiKey, channelId, maxVideos) {
  const apiUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  apiUrl.searchParams.set('key', apiKey);
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
    throw new Error(`YouTube API returned ${response.status}: ${body}`);
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
    .filter(Boolean)
    .slice(0, maxVideos);
}

async function fetchFeedVideos(feedUrl, maxVideos) {
  const response = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'easterling-ms-sync/1.0',
      Accept: 'application/atom+xml, application/xml, text/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`YouTube RSS returned ${response.status}`);
  }

  const xml = await response.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)];

  return entries
    .map((match) => {
      const entryXml = match[1];
      const videoId = readTag(entryXml, 'yt:videoId');
      const title = decodeXml(readTag(entryXml, 'title'));
      const published = readTag(entryXml, 'published');
      const author = decodeXml(readTag(entryXml, 'name')) || 'NagiKumoChillFi';
      
      const linkMatch = entryXml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
      const link = decodeXml(linkMatch?.[1] || '') || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');

      if (!videoId || !link) return null;

      return {
        videoId,
        title: title || 'Untitled video',
        published: published || '',
        author,
        link,
      };
    })
    .filter(Boolean)
    .slice(0, maxVideos);
}

async function fetchVideosTab(baseChannelUrl, maxVideos) {
  const videosUrl = `${baseChannelUrl.replace(/\/$/, '')}/videos`;
  const response = await fetch(videosUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`YouTube scrape returned ${response.status}`);
  }

  const html = await response.text();
  const matches = [...html.matchAll(/"videoId":"([^"]+)"[\s\S]{0,2500}?"title":\{"runs":\[\{"text":"([^"]+)"/g)];
  const seen = new Set();

  return matches
    .map((match) => {
      const videoId = match[1];
      const title = decodeJsonText(match[2]);

      if (!videoId || seen.has(videoId)) return null;
      seen.add(videoId);

      return {
        videoId,
        title: title || 'Untitled video',
        published: '',
        author: 'NagiKumo ChillFi',
        link: `https://www.youtube.com/watch?v=${videoId}`,
      };
    })
    .filter(Boolean)
    .slice(0, maxVideos);
}

function readTag(xml, tagName) {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(pattern);
  return match?.[1]?.trim() || '';
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
