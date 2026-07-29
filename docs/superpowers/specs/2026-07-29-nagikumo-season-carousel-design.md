# NagiKumo Season 1 Carousel Design

## Goal

Turn the Season 1 episode strip into an accessible carousel that shows four
episode cards at once on desktop and uses short, muted local-video previews for
published episodes. Unpublished episodes must remain blurred and must not play.

## Content and media rules

- Keep all ten Season 1 episodes in narrative order.
- Use only published or explicitly approved footage for playable previews.
- Create short, compressed web copies from the existing NagiKumo production
  folders; do not expose original project files or local filesystem paths.
- Episodes that are scheduled, in editing, or otherwise unpublished retain a
  blurred visual treatment and do not load or play preview video.
- Published cards continue to link to their public YouTube episode.
- Existing YouTube feed updates may refresh public titles, thumbnails, and
  links without changing the unpublished-media rule.

## Layout and interaction

- Show four complete cards at once on desktop, two on tablet, and one on mobile.
- Place clearly labeled previous and next arrow buttons beside the carousel.
- Move one card per arrow activation with smooth scroll snapping.
- Disable an arrow when the carousel is at its corresponding edge.
- Preserve touch and trackpad horizontal scrolling.
- Keep card heights and media aspect ratios consistent to avoid layout shifts.

## Preview behavior

- Published previews are muted, looped, and inline.
- A preview begins on pointer hover or keyboard focus and stops when interaction
  ends or the card leaves view.
- The poster image remains visible until playback begins and if video cannot
  load.
- Do not autoplay previews merely because the page loaded.
- Honor reduced-motion preferences by keeping the poster image static.

## Accessibility

- Arrow controls have descriptive accessible labels.
- Cards and their YouTube links remain keyboard reachable.
- Focus indicators remain visible.
- The carousel exposes a concise label and does not trap keyboard focus.
- Blurring is paired with visible publication-status text so status is not
  conveyed by appearance alone.

## Performance and resilience

- Generate brief, compressed preview assets sized for card display.
- Preload preview metadata only; avoid downloading every video on initial load.
- Use the existing poster images as a reliable fallback.
- The carousel remains a usable horizontal episode list when JavaScript is
  unavailable.

## Verification

- Confirm four, two, and one visible cards at representative desktop, tablet,
  and phone widths.
- Test both arrows, edge disabling, touch scrolling, keyboard focus, hover
  playback, focus playback, reduced motion, and unpublished-card blocking.
- Run the existing build and repository checks.
- After explicit publication authorization, deploy the exact validated commit
  to ChatGPT Sites and GitHub, then verify both hosted versions.
