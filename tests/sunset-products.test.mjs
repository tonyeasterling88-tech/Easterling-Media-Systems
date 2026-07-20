import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const publicDirectories = ['assets', 'blogs', 'Newsletters', 'posts'];
const searchableExtensions = new Set(['.css', '.html', '.js', '.json', '.xml']);
const retiredPatterns = [
  /lofi forge/i,
  /lofi[- ]creator[- ]tools/i,
  /driftmetrics/i,
  /ledgerly/i,
  /color[- ]match[- ]scanner/i,
];

async function collectSearchableFiles(directory) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSearchableFiles(entryPath)));
    } else if (searchableExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

test('retired products are absent from deployable website content', async () => {
  const rootFiles = (await readdir(root, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        searchableExtensions.has(path.extname(entry.name)) &&
        entry.name !== 'package.json' &&
        entry.name !== 'package-lock.json'
    )
    .map((entry) => path.join(root, entry.name));

  const nestedFiles = (
    await Promise.all(
      publicDirectories.map((directory) =>
        collectSearchableFiles(path.join(root, directory))
      )
    )
  ).flat();

  const violations = [];
  for (const file of [...rootFiles, ...nestedFiles]) {
    const contents = await readFile(file, 'utf8');
    for (const pattern of retiredPatterns) {
      if (pattern.test(contents)) {
        violations.push(path.relative(root, file));
        break;
      }
    }
  }

  assert.deepEqual(violations, []);
});
