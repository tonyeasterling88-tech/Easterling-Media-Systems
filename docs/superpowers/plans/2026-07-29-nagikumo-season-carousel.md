# NagiKumo Season 1 Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a responsive Season 1 carousel with four desktop cards, muted previews for Episodes 1–4, and blurred non-playing cards for Episodes 5–10.

**Architecture:** Keep the existing static NagiKumo page and add a focused ES module for carousel calculations and DOM behavior. Extend the current episode markup to all ten Season 1 entries, add lightweight web preview files derived from approved local footage, and use CSS scroll snapping for a resilient no-JavaScript horizontal list.

**Tech Stack:** Static HTML/CSS, browser-native JavaScript modules, Node.js test runner, FFmpeg, existing Sites build and hosting workflow.

## Global Constraints

- Keep all ten Season 1 episodes in narrative order.
- Use only published or explicitly approved footage for playable previews.
- Episodes that are scheduled, in editing, or otherwise unpublished remain blurred and do not load or play preview video.
- Show four complete cards on desktop, two on tablet, and one on mobile.
- Move one card per arrow activation and preserve touch/trackpad scrolling.
- Published previews are muted, looped, inline, and begin only on hover or keyboard focus.
- Honor `prefers-reduced-motion` by keeping poster images static.
- Keep YouTube title, thumbnail, status, and link refresh behavior.

---

### Task 1: Carousel calculation contract

**Files:**
- Create: `assets/episode-carousel.js`
- Create: `tests/nagikumo-carousel.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `cardsPerView(viewportWidth: number): number`
- Produces: `nextScrollPosition(current: number, direction: -1 | 1, step: number, maximum: number): number`
- Produces: `initEpisodeCarousels(root: Document | Element): void`

- [ ] **Step 1: Write failing calculation tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cardsPerView,
  nextScrollPosition,
} from '../assets/episode-carousel.js';

test('cardsPerView returns four, two, and one at responsive widths', () => {
  assert.equal(cardsPerView(1200), 4);
  assert.equal(cardsPerView(900), 2);
  assert.equal(cardsPerView(520), 1);
});

test('nextScrollPosition moves one step and clamps at both edges', () => {
  assert.equal(nextScrollPosition(0, 1, 280, 840), 280);
  assert.equal(nextScrollPosition(800, 1, 280, 840), 840);
  assert.equal(nextScrollPosition(20, -1, 280, 840), 0);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/nagikumo-carousel.test.mjs`

Expected: FAIL because `assets/episode-carousel.js` does not exist.

- [ ] **Step 3: Implement the calculation functions and guarded initializer**

```js
export function cardsPerView(viewportWidth) {
  if (viewportWidth <= 640) return 1;
  if (viewportWidth <= 980) return 2;
  return 4;
}

export function nextScrollPosition(current, direction, step, maximum) {
  return Math.max(0, Math.min(maximum, current + direction * step));
}

export function initEpisodeCarousels(root = document) {
  root.querySelectorAll('[data-episode-carousel]').forEach(initEpisodeCarousel);
}

if (typeof document !== 'undefined') {
  initEpisodeCarousels();
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `node --test tests/nagikumo-carousel.test.mjs`

Expected: 2 tests pass with 0 failures.

- [ ] **Step 5: Add the test script**

Add `"test": "node --test tests/*.test.mjs"` to `package.json`.

- [ ] **Step 6: Commit**

```powershell
git add -- assets/episode-carousel.js tests/nagikumo-carousel.test.mjs package.json
git commit -m "Add episode carousel behavior contract"
```

### Task 2: Approved muted preview assets

**Files:**
- Create: `assets/nagikumo/previews/episode-01-rainy-cafe.mp4`
- Create: `assets/nagikumo/previews/episode-02-tatami-morning.mp4`
- Create: `assets/nagikumo/previews/episode-03-sunset-train.mp4`
- Create: `assets/nagikumo/previews/episode-04-rainy-desk.mp4`

**Interfaces:**
- Consumes: Approved or published MP4 files in `C:\Users\tonye\Documents\01_YT LOFI\NagiKumo ChillFi`
- Produces: Four silent H.264 web previews, 8 seconds or shorter, 720 pixels high or smaller, with fast-start metadata.

- [ ] **Step 1: Select approved sources**

Use one published-folder source per episode. For Episode 4 use the clip inside the explicit `Tony Approved` directory; do not use the adjacent pending-review-only clips.

- [ ] **Step 2: Generate the four compact previews**

Run FFmpeg once per source with:

```powershell
ffmpeg -y -ss 2 -i "<approved-source.mp4>" -t 8 -an -vf "scale=-2:720:force_original_aspect_ratio=decrease,fps=24" -c:v libx264 -preset medium -crf 27 -movflags +faststart "<episode-preview.mp4>"
```

Expected: Four silent MP4 files under `assets/nagikumo/previews/`.

- [ ] **Step 3: Verify media constraints**

Run `ffprobe` for duration, dimensions, codecs, and audio streams on all four previews.

Expected: Each duration is at most 8 seconds, video is H.264, height is at most 720, and no audio stream exists.

- [ ] **Step 4: Commit**

```powershell
git add -- assets/nagikumo/previews
git commit -m "Add approved NagiKumo episode previews"
```

### Task 3: Season 1 carousel markup and styling

**Files:**
- Modify: `nagikumo-chillfi.html`
- Modify: `tests/nagikumo-carousel.test.mjs`

**Interfaces:**
- Consumes: `initEpisodeCarousels()` selectors and the four preview paths from Tasks 1–2.
- Produces: `[data-episode-carousel]`, `[data-carousel-track]`, `[data-carousel-prev]`, `[data-carousel-next]`, and published `<video data-episode-preview>` elements.

- [ ] **Step 1: Write failing page-contract tests**

Add assertions that the HTML contains:

```js
const episodeCount = (html.match(/<article class="episode/g) || []).length;
assert.equal(episodeCount, 10);
assert.match(html, /data-episode-carousel/);
assert.match(html, /data-carousel-prev/);
assert.match(html, /data-carousel-next/);
assert.equal((html.match(/data-episode-preview/g) || []).length, 4);
assert.equal((html.match(/class="episode unrevealed"/g) || []).length, 6);
assert.doesNotMatch(
  html,
  /episode-(05|06|07|08|09|10)[^"]*\.mp4/
);
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/nagikumo-carousel.test.mjs`

Expected: FAIL because the current page has five cards and no carousel controls or previews.

- [ ] **Step 3: Add carousel structure and all ten episodes**

Wrap the strip and arrow controls in a labeled carousel region. Add Episodes 6–10 as blurred cards with visible statuses:

- Episode 05 — Cherry Blossom Picnic — Scheduled
- Episode 06 — Library Study Time — Edit Phase
- Episode 07 — City Rooftop Sunset — Edit Phase
- Episode 08 — Temple Porch Rain — Edit Phase
- Episode 09 — Snowy Cabin Morning — Edit Phase
- Episode 10 — Airport Midnight — Edit Phase

Add muted, looped, inline, metadata-only video elements to Episodes 1–4 only:

```html
<video
  data-episode-preview
  muted
  loop
  playsinline
  preload="metadata"
  poster="assets/nagikumo/rainy-cafe.jpg"
>
  <source src="assets/nagikumo/previews/episode-01-rainy-cafe.mp4" type="video/mp4" />
</video>
```

Load the module with:

```html
<script type="module" src="assets/episode-carousel.js"></script>
```

- [ ] **Step 4: Implement responsive scroll-snap styling**

Use a four-column flex-basis above 980px, two columns from 641–980px, and one column at 640px or below. Style arrows as restrained circular controls, keep visible focus states, blur all `.unrevealed` media, and preserve a static poster under video.

- [ ] **Step 5: Run the tests and verify GREEN**

Run: `npm test`

Expected: All repository tests pass with 0 failures.

- [ ] **Step 6: Commit**

```powershell
git add -- nagikumo-chillfi.html tests/nagikumo-carousel.test.mjs
git commit -m "Build responsive Season 1 episode carousel"
```

### Task 4: Interaction behavior

**Files:**
- Modify: `assets/episode-carousel.js`
- Modify: `tests/nagikumo-carousel.test.mjs`

**Interfaces:**
- Consumes: Task 3 carousel selectors.
- Produces: One-card arrow movement, edge-state updates, muted hover/focus playback, pause/reset behavior, and reduced-motion blocking.

- [ ] **Step 1: Write failing source-contract tests**

Assert that the module contains the required browser behaviors:

```js
assert.match(moduleSource, /scrollTo\(/);
assert.match(moduleSource, /aria-disabled/);
assert.match(moduleSource, /pointerenter/);
assert.match(moduleSource, /focusin/);
assert.match(moduleSource, /prefers-reduced-motion/);
assert.match(moduleSource, /\.pause\(\)/);
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --test tests/nagikumo-carousel.test.mjs`

Expected: FAIL because the initializer does not yet wire scrolling or preview playback.

- [ ] **Step 3: Implement one-card movement and edge states**

Measure the first card width plus computed gap, use `nextScrollPosition()`, call `track.scrollTo({ left, behavior })`, and update each arrow's `disabled` and `aria-disabled` values after scroll and resize.

- [ ] **Step 4: Implement preview playback**

On `pointerenter` and `focusin`, call `video.play()` only when reduced motion is off and the card is not `.unrevealed`. On `pointerleave` and `focusout`, pause and reset the video. Keep `video.muted = true` before every play attempt.

- [ ] **Step 5: Run the tests and verify GREEN**

Run: `npm test`

Expected: All tests pass with 0 failures.

- [ ] **Step 6: Commit**

```powershell
git add -- assets/episode-carousel.js tests/nagikumo-carousel.test.mjs
git commit -m "Wire carousel controls and muted previews"
```

### Task 5: Responsive browser verification and build

**Files:**
- Modify only if verification reveals a tested defect.

**Interfaces:**
- Consumes: Finished carousel page and interaction module.
- Produces: Verified responsive and accessible behavior plus a deployable `dist/`.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: All tests pass with 0 failures.

- [ ] **Step 2: Run the deployment build**

Run: `npm run build`

Expected: Exit code 0 and `Sites build ready in dist/`.

- [ ] **Step 3: Start the local site and verify desktop**

At a 1200-pixel viewport, confirm exactly four complete cards are visible, next moves one card, previous returns one card, and edge controls disable correctly.

- [ ] **Step 4: Verify tablet and phone**

At 900 pixels confirm two complete cards. At 520 pixels confirm one complete card. Confirm touch-style horizontal scroll remains available.

- [ ] **Step 5: Verify preview and accessibility behavior**

Confirm Episodes 1–4 play muted on hover/focus and stop afterward. Confirm Episodes 5–10 remain blurred and never play. Confirm keyboard focus indicators, control labels, and reduced-motion static posters.

- [ ] **Step 6: Commit any verification fixes**

Only when needed, write a failing regression test, apply the minimal fix, rerun tests and build, then commit the affected files.

### Task 6: Publish and verify both hosted versions

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: Exact validated `main` commit and built Sites archive.
- Produces: Matching GitHub `origin/main`, successful GitHub Pages deployment, and successful private ChatGPT Sites deployment.

- [ ] **Step 1: Confirm clean exact source state**

Run: `git status --short --branch` and `git rev-parse HEAD`.

Expected: Clean `main` branch with a single validated HEAD.

- [ ] **Step 2: Push the exact commit to GitHub**

Run: `git push origin main`

Expected: `origin/main` contains the validated HEAD.

- [ ] **Step 3: Verify GitHub Pages**

Confirm the Pages workflow for the pushed commit succeeds and
`https://www.easterlingmediasystems.com/nagikumo-chillfi.html` serves the carousel.

- [ ] **Step 4: Publish the same commit to ChatGPT Sites**

Push the exact source commit to the existing Sites source repository, package the validated build, save one version, deploy privately, and poll until the deployment succeeds.

- [ ] **Step 5: Verify production**

Confirm the custom domain renders four published preview cards plus six blurred unpublished cards, and confirm the authenticated ChatGPT Sites URL is the successful deployment for the same commit.
