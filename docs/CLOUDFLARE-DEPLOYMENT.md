# Cloudflare deployment — 24 October 2026

Public URL: https://open-anatomy.anshmaansingh.workers.dev

## Configuration

- Worker: `open-anatomy`, in the account explicitly selected by the owner (`d051367e42867b974cb97f0881ddeadb`).
- Workers Static Assets serves the complete `dist/` build, including the processed model libraries. No R2 bucket, database, custom domain or paid resource was created for this release.
- GitHub source: `Anshmaan29/3d-anatomy`, production branch `main`, root `/`.
- Build: `npm run build`; deploy: `npx wrangler@4.152.0 deploy`.
- Preview branch builds and version preview URLs are disabled. Production uses the free `workers.dev` address and single-page application routing.
- A separate `Open Anatomy build token` was created in Cloudflare after the owner explicitly approved the permissions displayed by its live form. Its secret was neither read nor committed. Existing ResortOS credentials and applications were not modified.
- `.wrangler/` is ignored; future CLI releases must authenticate separately to the configured account. The Git connection builds and deploys production pushes in Cloudflare.

## Initial successful release

Source commit: `043ae17` (same app/model build as the tested `f3a5c35` checkpoint; changes between these commits are deployment configuration only).

Cloudflare build: `79087cd5-72da-4a63-8a06-e5507829c405`.

Initial deployed Worker version: `0ff35112-e68b-4e44-802f-a81cb5613c63`.

The cloud build installed dependencies, passed TypeScript/Vite compilation and reported all asset uploads and deployment successful. Its app asset hashes matched the locally tested release. The build tree contained 696 files (260,592,066 bytes); Wrangler deduplicates identical asset contents.

## Public-site verification

The unauthenticated public page showed the High/Balanced/Low power startup popup, then rendered 436 skeletal surfaces. Exact deep links loaded the 14-part deep-brain collection and the internal-heart collection. The explicit offline preparation saved 29 required files for the brain view. Browser error/warning logs were empty during the initial public smoke check.

These checks establish successful publication and representative asset delivery. The browser used here does not expose offline network emulation, so a network-disconnected reload on this new origin is not claimed. A full offline reload with the server stopped passed for the equivalent local production build; physical iPad/Android testing and qualified anatomical review remain pending.

## Interrupted dashboard upload

The direct browser upload timed out and left an empty `anatomystudio` Worker in the selected account, with no versions, deployments or active public routes. The working Git-backed release uses `open-anatomy`. The inactive empty Worker was retained; it was not silently deleted.

The earlier Sites preview retains its owner-private audience. The public Cloudflare deployment was explicitly requested by the owner.
