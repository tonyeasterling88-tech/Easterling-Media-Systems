import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const indexHtml = await readFile('index.html', 'utf8');
const homeCss = await readFile('assets/home.css', 'utf8').catch(() => '');
const homeJs = await readFile('assets/home.js', 'utf8').catch(() => '');

function tags(source, tagName) {
  return source.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) || [];
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? null;
}

function hasBooleanAttribute(tag, name) {
  return new RegExp(`(?:^|\\s)${name}(?=\\s|=|/?>)`, 'i').test(tag);
}

function classTokens(tag) {
  return (attribute(tag, 'class') || '').split(/\s+/).filter(Boolean);
}

function countAttribute(source, name) {
  return tags(source, '[a-z][a-z0-9:-]*').filter((tag) => (
    new RegExp(`\\b${name}(?=\\s|=|/?>)`, 'i').test(tag)
  )).length;
}

function extractElement(source, tagName) {
  return source.match(new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'i'))?.[0] || '';
}

function extractMarkerSection(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const end = source.indexOf('</section>', start);
  return source.slice(start, end === -1 ? source.length : end);
}

function stripCssComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function cssRules(source) {
  return [...stripCssComments(source).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim(),
    declarations: match[2],
  }));
}

function extractAtRule(source, atRulePattern) {
  const start = source.search(atRulePattern);
  if (start === -1) return '';
  const openingBrace = source.indexOf('{', start);
  if (openingBrace === -1) return '';

  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return '';
}

function containsSchemaType(value, expectedType) {
  if (Array.isArray(value)) return value.some((item) => containsSchemaType(item, expectedType));
  if (!value || typeof value !== 'object') return false;
  if (value['@type'] === expectedType) return true;
  return Object.values(value).some((item) => containsSchemaType(item, expectedType));
}

function createClassList(initialValues = []) {
  const values = new Set(initialValues);
  return {
    values,
    add(...names) {
      names.forEach((name) => values.add(name));
    },
    remove(...names) {
      names.forEach((name) => values.delete(name));
    },
    contains(name) {
      return values.has(name);
    },
    toggle(name, force) {
      const shouldAdd = force ?? !values.has(name);
      if (shouldAdd) values.add(name);
      else values.delete(name);
      return shouldAdd;
    },
  };
}

function executeHomeScript({ reducedMotion, withObserver }) {
  const classList = createClassList();
  const revealTarget = {
    classList,
    dataset: {},
    style: { setProperty() {} },
    addEventListener() {},
    getAttribute() { return null; },
    setAttribute() {},
  };
  const observers = [];
  const rootClassList = createClassList();
  const bodyClassList = createClassList(['home-editorial']);
  const document = {
    readyState: 'complete',
    body: { classList: bodyClassList },
    documentElement: { classList: rootClassList },
    querySelector() { return null; },
    querySelectorAll() { return [revealTarget]; },
    addEventListener(type, callback) {
      if (type === 'DOMContentLoaded') callback();
    },
  };
  const sandbox = {
    console: { error() {}, log() {}, warn() {} },
    document,
    requestAnimationFrame(callback) { callback(); },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
  };

  if (reducedMotion !== undefined) {
    sandbox.matchMedia = () => ({
      matches: reducedMotion,
      addEventListener() {},
      removeEventListener() {},
    });
  }

  if (withObserver) {
    sandbox.IntersectionObserver = class FakeIntersectionObserver {
      constructor(callback) {
        this.callback = callback;
        this.observed = [];
        observers.push(this);
      }

      observe(target) {
        this.observed.push(target);
      }

      unobserve(target) {
        this.observed = this.observed.filter((item) => item !== target);
      }

      disconnect() {}
    };
  }

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(homeJs, sandbox, { filename: 'assets/home.js' });
  return { classList, observers, revealTarget, rootClassList };
}

test('homepage preserves canonical metadata, structured data, and shared runtimes', () => {
  const canonicalLinks = tags(indexHtml, 'link').filter((tag) => (
    (attribute(tag, 'rel') || '').split(/\s+/).includes('canonical')
  ));
  assert.equal(canonicalLinks.length, 1);
  assert.equal(attribute(canonicalLinks[0], 'href'), 'https://www.easterlingmediasystems.com/');

  const jsonLdPayloads = [...indexHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => /\btype\s*=\s*(["'])application\/ld\+json\1/i.test(match[1]))
    .map((match) => JSON.parse(match[2]));
  assert.ok(jsonLdPayloads.some((payload) => containsSchemaType(payload, 'Organization')));

  const scriptTags = tags(indexHtml, 'script');
  const runtimeContracts = [
    { source: /^assets\/site\.js(?:\?.*)?$/, defer: true },
    { source: /^assets\/closed-testing\.js(?:\?.*)?$/, type: 'module' },
    { source: /^assets\/newsletters\.js(?:\?.*)?$/, defer: true },
  ];
  for (const contract of runtimeContracts) {
    const matches = scriptTags.filter((tag) => contract.source.test(attribute(tag, 'src') || ''));
    assert.equal(matches.length, 1, `${contract.source} should be loaded exactly once`);
    if (contract.defer) assert.ok(hasBooleanAttribute(matches[0], 'defer'));
    if (contract.type) assert.equal(attribute(matches[0], 'type'), contract.type);
  }
});

test('homepage opts into the Editorial Workshop assets', () => {
  const bodyTags = tags(indexHtml, 'body');
  assert.equal(bodyTags.length, 1);
  assert.ok(classTokens(bodyTags[0]).includes('home-editorial'));

  const stylesheetHrefs = tags(indexHtml, 'link')
    .filter((tag) => (attribute(tag, 'rel') || '').split(/\s+/).includes('stylesheet'))
    .map((tag) => attribute(tag, 'href'));
  assert.ok(stylesheetHrefs.some((href) => /^assets\/styles\.css(?:\?.*)?$/.test(href || '')));
  assert.ok(stylesheetHrefs.some((href) => /^assets\/home\.css(?:\?.*)?$/.test(href || '')));

  const homeScripts = tags(indexHtml, 'script').filter((tag) => (
    /^assets\/home\.js(?:\?.*)?$/.test(attribute(tag, 'src') || '')
  ));
  assert.equal(homeScripts.length, 1);
  assert.ok(hasBooleanAttribute(homeScripts[0], 'defer'));
});

test('workshop ledger contains exactly the four real site pillars', () => {
  const ledger = indexHtml.match(/<section\b[^>]*class=(["'])[^"']*\bhome-ledger\b[^"']*\1[^>]*>[\s\S]*?<\/section>/i)?.[0] || '';
  assert.ok(ledger, 'the pillar ledger should be present');

  const pillarRows = tags(ledger, '[a-z][a-z0-9:-]*').filter((tag) => (
    classTokens(tag).includes('home-ledger__item')
  ));
  assert.equal(pillarRows.length, 4);

  for (const href of ['builds.html', 'blogs.html', 'newsletters.html', 'nagikumo-chillfi.html']) {
    assert.equal(
      pillarRows.filter((tag) => attribute(tag, 'href') === href).length,
      1,
      `${href} should appear once as a pillar row`,
    );
  }
});

test('homepage uses the current writing and newsletter fallbacks', () => {
  assert.match(indexHtml, /href=(["'])posts\/august-10-systems-note-build-for-the-next-episode\.html\1/i);
  assert.match(indexHtml, /Systems\s+Note:\s+Build\s+for\s+the\s+Next\s+Episode/i);

  assert.equal(countAttribute(indexHtml, 'data-newsletter-home-issue'), 1);
  assert.equal(countAttribute(indexHtml, 'data-newsletter-archive-status'), 1);

  const newsletterFallback = extractMarkerSection(indexHtml, 'data-newsletter-home-issue');
  assert.match(newsletterFallback, /newsletters\.html\?issue=systems-update-turning-content-into-a-pipeline/i);
  assert.match(newsletterFallback, /Systems\s+Update\b[\s\S]{0,100}\bTurning\s+Content\s+into\s+a\s+Pipeline/i);
  assert.match(newsletterFallback, /(?:2026-08-03|August\s+3,?\s+2026)/i);
});

test('homepage uses descriptive local NagiKumo art and no generic CGI art in main', async () => {
  const main = extractElement(indexHtml, 'main');
  assert.ok(main, 'main content should be present');

  const nagiImage = tags(main, 'img').find((tag) => (
    /^assets\/nagikumo\/[^?#]+\.(?:jpe?g|png|webp)$/i.test(attribute(tag, 'src') || '')
  ));
  assert.ok(nagiImage, 'main should use a local NagiKumo image');

  const source = attribute(nagiImage, 'src');
  const imageStats = await stat(path.resolve(source));
  assert.ok(imageStats.isFile() && imageStats.size > 0, `${source} should be a non-empty local file`);

  const alt = (attribute(nagiImage, 'alt') || '').trim();
  assert.ok(alt.length >= 12, 'the NagiKumo image needs descriptive alt text');
  assert.ok((alt.match(/[a-z0-9]+/gi) || []).length >= 3, 'alt text should describe the scene');
  assert.doesNotMatch(alt, /^(?:image|photo|picture|artwork|thumbnail|nagikumo(?: chillfi)?)$/i);

  assert.doesNotMatch(
    main,
    /assets\/(?:easterlingms_header|Futuristic\s+(?:media\s+studio\s+design|tech\s+emblem\s+logo))\.png/i,
  );
});

test('homepage keeps each real visitor hook once and removes fake dashboard UI', () => {
  for (const hook of ['data-site-total-visits', 'data-site-your-visits', 'data-site-other-visits']) {
    assert.equal(countAttribute(indexHtml, hook), 1, `${hook} should appear exactly once`);
  }

  const forbiddenClasses = new Set([
    'system-status',
    'status-head',
    'status-dots',
    'status-row',
    'status-value',
    'status-label',
    'mini-line',
    'mini-bars',
    'mini-meter',
  ]);
  const usedClasses = tags(indexHtml, '[a-z][a-z0-9:-]*').flatMap(classTokens);
  for (const className of forbiddenClasses) {
    assert.ok(!usedClasses.includes(className), `fake dashboard class ${className} should be absent`);
  }
  assert.doesNotMatch(indexHtml, />\s*System Status\s*</i);
});

test('skip link, landmarks, and heading outline provide a sound document structure', () => {
  const body = extractElement(indexHtml, 'body');
  const firstBodyLink = tags(body, 'a')[0] || '';
  assert.ok(classTokens(firstBodyLink).includes('skip-link'));
  assert.equal(attribute(firstBodyLink, 'href'), '#main-content');

  const mainTags = tags(indexHtml, 'main');
  assert.equal(mainTags.length, 1);
  assert.equal(attribute(mainTags[0], 'id'), 'main-content');
  assert.ok(tags(indexHtml, 'header').length >= 1);
  assert.equal(tags(indexHtml, 'footer').length, 1);

  const navTags = tags(indexHtml, 'nav');
  assert.ok(navTags.length >= 1);
  assert.ok(navTags.every((tag) => (attribute(tag, 'aria-label') || '').trim().length > 0));

  const main = extractElement(indexHtml, 'main');
  const headingLevels = [...main.matchAll(/<h([1-6])\b/gi)].map((match) => Number(match[1]));
  assert.ok(headingLevels.length > 1);
  assert.equal(headingLevels[0], 1);
  assert.equal(headingLevels.filter((level) => level === 1).length, 1);
  assert.ok(headingLevels.includes(2));
  for (let index = 1; index < headingLevels.length; index += 1) {
    assert.ok(
      headingLevels[index] - headingLevels[index - 1] <= 1,
      `heading level should not jump from h${headingLevels[index - 1]} to h${headingLevels[index]}`,
    );
  }
});

test('home palette and flat visual language stay exact', () => {
  const css = stripCssComments(homeCss);
  const palette = {
    ink: '#171912',
    bone: '#f3eee3',
    oxide: '#c85b32',
    moss: '#5c6b45',
    mustard: '#d2a33b',
    hairline: '#d3c9b7',
  };

  for (const [name, expected] of Object.entries(palette)) {
    const values = [...css.matchAll(new RegExp(`--${name}\\s*:\\s*([^;}{]+)`, 'gi'))]
      .map((match) => match[1].trim().toLowerCase());
    assert.deepEqual(values, [expected], `--${name} should have one exact palette value`);
  }

  assert.doesNotMatch(css, /\b(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i);
});

test('home CSS provides visible focus, mobile layout, and 44px targets', () => {
  const rules = cssRules(homeCss);
  const focusRules = rules.filter(({ selector }) => /:focus-visible\b/i.test(selector));
  assert.ok(focusRules.length > 0);
  assert.ok(focusRules.some(({ declarations }) => /\b(?:outline|box-shadow|border)\s*:/i.test(declarations)));
  assert.ok(focusRules.every(({ declarations }) => !/\boutline\s*:\s*(?:0|none)\b/i.test(declarations)));

  assert.match(homeCss, /@media\s*\([^)]*max-width\s*:/i);

  const interactiveSelector = /(?:^|[,\s>+~])(?:a|button)\b|\.btn\b|\.button\b|\.skip-link\b|\[role\s*=\s*(["'])?button\1?\]/i;
  const hasMinimumTarget = rules.some(({ selector, declarations }) => (
    interactiveSelector.test(selector)
    && /\b(?:min-)?(?:height|block-size)\s*:\s*(?:44px|2\.75rem)\b/i.test(declarations)
  ));
  assert.ok(hasMinimumTarget, 'an interactive control rule should provide at least 44px block size');
});

test('reduced-motion CSS and JS leave content visible without animation', () => {
  const reducedMotionCss = extractAtRule(
    stripCssComments(homeCss),
    /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i,
  );
  assert.ok(reducedMotionCss, 'home CSS should include a reduced-motion media query');
  assert.match(
    reducedMotionCss,
    /\b(?:animation(?:-duration)?|transition(?:-duration)?)\s*:\s*(?:none|0(?:s|ms)?)(?:\s*!important)?\b/i,
  );

  assert.match(homeJs, /prefers-reduced-motion\s*:\s*reduce/i);
  const result = executeHomeScript({ reducedMotion: true, withObserver: true });
  assert.equal(result.observers.length, 0, 'reduced motion should bypass IntersectionObserver animation');
  assert.ok(!result.rootClassList.contains('home-motion-ready'), 'reduced-motion content should remain visible');
});

test('home JS progressively reveals observed content', () => {
  const result = executeHomeScript({ reducedMotion: false, withObserver: true });
  assert.equal(result.observers.length, 1);
  assert.deepEqual(result.observers[0].observed, [result.revealTarget]);
  assert.ok(result.rootClassList.contains('home-motion-ready'));
  assert.ok(!result.classList.contains('is-revealed'));

  result.observers[0].callback(
    [{ isIntersecting: true, target: result.revealTarget }],
    result.observers[0],
  );
  assert.ok(result.classList.contains('is-revealed'));
  assert.deepEqual(result.observers[0].observed, []);
});

test('home JS is safe when matchMedia is unavailable', () => {
  assert.doesNotThrow(() => executeHomeScript({ reducedMotion: undefined, withObserver: true }));
});

test('home JS leaves content visible when IntersectionObserver is unavailable', () => {
  const result = executeHomeScript({ reducedMotion: false, withObserver: false });
  assert.ok(!result.rootClassList.contains('home-motion-ready'));
});
