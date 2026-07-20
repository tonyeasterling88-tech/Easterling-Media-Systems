# Sunset Five Products From the Website

## Goal

Completely remove LoFi Forge, LoFi Creator Tools, DriftMetrics, Ledgerly, and Color Match Scanner from the public Easterling Media & Systems website.

## Scope

- Delete the five standalone product HTML pages so their direct URLs return 404 responses.
- Remove their cards from the Builds archive.
- Remove their URLs from the sitemap.
- Remove their names and related copy from historical posts and the newsletter archive.
- Remove the LoFi Creator Tools cross-link from the retained LoFi Stamp page.
- Keep LoFi Stamp and all unrelated products unchanged.

## Verification

An automated content test will scan the public website source and fail if any retired product name or path remains. The production build and existing test suite must pass before a private Sites deployment. The deployed URLs for the removed pages must return 404 responses, while the Builds page and LoFi Stamp must remain available.

## Deployment

Publish the validated source as a new private version of the existing Sites project. Do not use Vercel.
