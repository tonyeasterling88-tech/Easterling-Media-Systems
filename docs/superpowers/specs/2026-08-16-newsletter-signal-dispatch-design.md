# Signal Dispatch Newsletter Archive Redesign

**Date:** 2026-08-16  
**Status:** approved design; implementation not started

## Goal

Redesign the public newsletter archive at `newsletters.html` so it reads as an Easterling field-report archive rather than a generic card collection. The first release covers the public archive and embedded latest-issue reader only. It does not change Firestore, draft generation, publication, outbound email, or access settings.

## Visual direction

Use the approved **Signal Dispatch** system: deep navy editorial surfaces, electric cyan signal geometry, restrained silver text, and a small warm-gold action accent. The page should feel like an independent technical publication: focused, calm, and intentional.

Visual thesis: a dark, first-party transmission archive with a clear editorial reading path and no generic card grid.

Content plan:

1. A full-width archive masthead establishes the newsletter and anchors the current issue.
2. A latest-transmission feature gives the newest issue title, summary, and entry point visual priority.
3. A compact transmission index presents prior issues as dated rows rather than cards.
4. A small owned-link footer reinforces that issues are published on this domain.

Interaction thesis:

1. A restrained hero entrance for the masthead and signal rings, disabled under reduced motion.
2. Subtle row hover/focus transitions that clarify archive affordance.
3. A reading transition from selected archive row into the latest-issue reader without adding a separate navigation model.

## Architecture and data handling

The first release keeps the current public data contract unchanged.

- `scripts/publish-newsletter.mjs` continues to publish approved Firestore drafts into `assets/newsletter-issues.json`.
- `assets/newsletters.js` remains the client-side renderer and will use the existing issue fields: `id`, `title`, `summary`, `issueLabel`, `html`, `url`, and optional `thumbnailUrl`.
- `newsletters.html` retains its existing navigation and loading anchors.
- `assets/styles.css` receives newsletter-scoped styles only.

The renderer must gracefully handle missing `thumbnailUrl`; Signal Dispatch’s signal-ring artwork is sufficient when no issue art is available. Custom issue artwork and editorial metadata are intentionally deferred to a later schema enhancement.

## Components

### Archive masthead

Replace the current split hero and promise grid with one high-contrast, full-width `newsletter-hero` region. It contains the newsletter name, purpose, owned-publication cue, and an anchor link to the newest issue. A CSS-only signal-ring treatment provides visual depth without requiring a new image asset.

### Latest transmission

Replace the generic `.card` reader shell with a structured editorial feature. It shows issue label/date, title, summary, and reading entry context above the existing rendered issue body. Keep the reading body narrow enough for long-form scanning and preserve the existing section heading structure from generated HTML.

### Transmission index

Replace generic archive cards with accessible issue rows: date/label, title and summary, then an explicit entry affordance. Rows support optional thumbnails without reserving empty visual boxes when imagery is absent.

### Reader CTA and errors

Retain the existing first-party archive CTA in an editorial footer treatment. Loading and failure messages use `aria-live="polite"` and remain useful without JavaScript styling.

## Accessibility and responsive behavior

- Preserve one page H1; feature and archive headings follow in descending order.
- Add visible `:focus-visible` treatments for all newsletter links and row controls.
- Maintain accessible contrast for cyan, muted, and gold text on dark surfaces.
- Preserve the existing safe HTML rendering path; do not expand the allowed content model in this release.
- Keep media within its container, prevent long-link overflow, and test 320px, 375px, 768px, and 1440px widths.
- Use the existing reduced-motion preference to disable nonessential transitions.

## Error handling

- Missing or invalid archive data leaves a polite explanatory status and avoids broken visual shells.
- A missing requested `?issue=` continues to fall back to the latest issue unless the existing behavior is deliberately changed and tested.
- Missing optional artwork must render as typography plus signal geometry, never a broken image.

## Verification

1. Add focused tests for archive JSON parsing, selected issue behavior, missing-thumbnail rendering, and load/error status.
2. Run `rtk npm test`.
3. Run `rtk npm run build`.
4. Run `rtk git diff --check`.
5. Review `/newsletters.html` locally at desktop and 375px widths; test latest, valid `?issue=`, invalid `?issue=`, archive links, keyboard navigation, and browser-console errors.

## Out of scope

- Firestore draft schema or generator changes.
- Custom per-issue art generation or upload workflows.
- Outbound email templates.
- Publishing, deployment, access-setting, or domain changes.
