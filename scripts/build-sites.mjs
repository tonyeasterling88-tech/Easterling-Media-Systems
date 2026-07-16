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

const worker = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/youtube') {
      url.pathname = '/assets/youtube-videos.json';
      return env.ASSETS.fetch(new Request(url, request));
    }

    return env.ASSETS.fetch(request);
  },
};
`;

await writeFile(path.join(serverOut, 'index.js'), worker, 'utf8');

console.log('Sites build ready in dist/');
