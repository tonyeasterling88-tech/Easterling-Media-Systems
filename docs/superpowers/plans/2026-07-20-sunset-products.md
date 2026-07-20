# Sunset Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove LoFi Forge, LoFi Creator Tools, DriftMetrics, Ledgerly, and Color Match Scanner from every public website surface.

**Architecture:** Preserve the existing static HTML site and Sites worker. Enforce the removal with a Node test that scans all deployable public source files for the retired names and URL slugs.

**Tech Stack:** Static HTML, Node.js test runner, existing Sites build script

## Global Constraints

- Keep LoFi Stamp and every unrelated product unchanged.
- Removed direct URLs must return 404 responses.
- Publish privately through Sites only; do not use Vercel.

---

### Task 1: Add the removal regression test

**Files:**
- Create: `tests/sunset-products.test.mjs`

- [ ] Write a Node test that recursively scans deployable HTML, XML, and JSON files outside ignored build/dependency directories for the five retired names and slugs.
- [ ] Run `node --test tests/sunset-products.test.mjs` and confirm it fails because the retired content still exists.

### Task 2: Remove the retired website content

**Files:**
- Delete: `lofi-forge.html`
- Delete: `lofi-creator-tools.html`
- Delete: `driftmetrics.html`
- Delete: `ledgerly.html`
- Delete: `color-match-scanner.html`
- Modify: `builds.html`
- Modify: `sitemap.xml`
- Modify: `lofi-stamp.html`
- Modify: `posts/april-systems-update-turning-content-into-a-pipeline.html`
- Modify: `posts/may-systems-update-making-the-build-archive-honest.html`
- Modify: `posts/june-systems-update-making-the-content-loop-live.html`
- Modify: `assets/newsletter-issues.json`

- [ ] Delete the five standalone pages.
- [ ] Remove the five archive cards and sitemap entries.
- [ ] Remove historical mentions and the obsolete LoFi Stamp cross-link.
- [ ] Run `node --test tests/sunset-products.test.mjs` and confirm it passes.

### Task 3: Validate and publish

**Files:**
- Verify: `.openai/hosting.json`
- Verify: `dist/server/index.js`

- [ ] Run `npm test` and `npm run build`.
- [ ] Re-run the retired-content search against source and generated output.
- [ ] Commit and push only the scoped changes.
- [ ] Package the exact build, save a Sites version, deploy it privately, and poll to success.
- [ ] Open the deployed Sites URL in the in-app Browser and verify the Builds page works while each removed URL returns 404.
