# Anatomy Studio

An independent, free-to-explore 3D anatomy workspace for medical study. Built with React, TypeScript, Three.js and React Three Fiber. This is a working development release; anatomy review and physical-device acceptance are still pending.

## Run

```sh
npm ci
npm run dev
```

Open the printed local URL. `npm test` validates the anatomy assets and `npm run build` creates `dist/`. Node 22 LTS is supported. The repository includes browser-ready, redistributable models, so no account, backend or model download pipeline is needed to run the application.

## Current checkpoint

- 1,660 selectable structures across ten systems: 1,654 BodyParts3D concepts and six separately licensed Z-Anatomy lung/liver surfaces.
- Real indexed anatomy, shared spatial alignment, smooth orbit/zoom/pan, focus, orientation presets, visibility, isolation, opacity, exploded view and surface clipping.
- Search by names, synonyms and source identifiers, regional browsing and structure deep links.
- Surface-anchored personal annotations: place a pin on a mesh, write a note, rotate/zoom/pan and retain its 3D position. Notes persist locally and appear in exported images.
- Device-local bookmarks and exact camera views, JSON export and four-choice structure identification practice.
- High-detail and balanced model sets. Balanced retains every structure and reduces the primary data from 6.45M to 3.27M triangles. Only requested systems load. Rendering pauses while the view is idle.
- Responsive tablet layouts, larger touch targets and iPad home-screen installation support. The service worker caches previously visited systems for offline reuse in production.
- No tracking, external fonts, login or health-data collection. Saved data stays in the browser. Clearing site data removes local saves.

## Tablet and iPad priorities

Primary layouts: 11-inch iPad portrait/landscape (834×1194 / 1194×834) and 13-inch tablet layouts (1024×1366 / 1366×1024). The browser collapses into a drawer on narrower tablets, while the inspector remains independently scrollable. Touch controls use larger targets on coarse-pointer tablets; two-finger gestures pan/zoom the model. Actual iPad Safari, Apple Pencil and Android tablet performance remain to be tested on hardware.

## Sources and licences

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. Source archive: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/ . The current archive licence grants CC BY 4.0; historical source headers are retained in provenance.

The six selected lung/liver meshes are adapted Z-Anatomy geometry via the nqwrc 3d-anatomy conversion, licensed CC BY-SA 4.0. Required notices, contributors, changes and exclusions are in `public/models/supplement/LICENSE.txt`. Those adapted assets retain that licence. Their alignment is approximate; independent thoracic landmark discrepancies are 3–9.4 mm. They are an educational overlay pending anatomy review.

Selected skeletal notes paraphrase linked OpenStax Anatomy and Physiology 2e chapters. They have source links and are explicitly marked as awaiting clinical review. Personal annotations are user-authored, not medically reviewed content.

No commercial Anatomy 3D Atlas meshes, textures, descriptions or code are redistributed. Shipped-artifact observations and reference coverage are recorded in `evidence/REFERENCE-INVESTIGATION.md`.

## Verification and release boundaries

See `docs/QUALITY.md` for completed checks and outstanding release criteria, `docs/DATA_PIPELINE.md` for reproducible primary data processing, and the public provenance JSON for checksums, transforms, licences, categories and omissions. The model represents one adult male-derived source; female reproductive anatomy, pathology, histology, complete muscle teaching notes and clinical certification are absent. Surface clipping is an uncapped geometry cut, not a CT/MRI reconstruction. Source categories and LOD detail require qualified review.

## Deployment

The Vite `dist/` output can be hosted as static assets. `wrangler.jsonc` supports direct Cloudflare Workers Static Assets deployment. Each processed asset is under 25 MiB, so this checkpoint does not require R2 or Supabase. `.openai/hosting.json` identifies the private Sites deployment. Credentials, raw downloads, temporary tooling, dependencies and build output are excluded from Git.

GitHub checkpoint destination: https://github.com/Anshmaan29/3d-anatomy . Push major completed checkpoints with validation notes; never push credentials or unrelated local files.
