# Open Anatomy

An independent, free-to-explore 3D anatomy workspace for medical study. Built with React, TypeScript, Three.js and React Three Fiber. This is a working development release; anatomy review and physical-device acceptance are still pending.

Public website: https://open-anatomy.anshmaansingh.workers.dev .

The earlier owner-private preview remains at https://anatomy-studio-mbbs.aurorayew128.chatgpt.site .

## Run

```sh
npm ci
npm run dev
```

Open the printed local URL. `npm test` validates the anatomy assets and `npm run build` creates `dist/`. Node 22 LTS is supported. The repository includes browser-ready models, so no account, backend or extraction pipeline is needed to run it. The two model libraries have separate reuse terms below.

## Current checkpoint

- Open Anatomy uses 1,985 recovered Atlas anatomical model records, represented by 2,225 selectable surfaces (including alternate and internal-heart surfaces); 979 associated landmarks plus 23 separately retained unassociated source anchors.
- One normal student workspace. The archived BodyParts3D/Z-Anatomy assets remain in the repository and explicit legacy links still work; there is no competing library selector.
- A graphics popup appears on each fresh page opening, remembers High/Balanced/Low power, and delays 3D loading until the user continues. Settings can change the choice later.
- Source English/Latin labels, 280 muscle detail records and muscle depth layers 1–10. Four conflicting source Latin labels are withheld and flagged.
- Real indexed anatomy, shared spatial alignment, smooth orbit/zoom/pan, focus, orientation presets, visibility, isolation, opacity, exploded view and surface clipping.
- Search by names, synonyms and source identifiers, regional browsing and structure deep links.
- Surface-anchored personal annotations: place a pin on a mesh, write a note, rotate/zoom/pan and retain its 3D position. Notes persist locally and appear in exported images.
- Device-local bookmarks and exact camera views, JSON export and four-choice structure identification practice.
- High-detail and balanced model sets. The Atlas adaptation occupies about 198 MB for both complete quality libraries together; systems load on demand, with shared images and inactive GPU resource cleanup. High Atlas geometry retains 7.50M triangles; balanced has 6.80M. Open primary geometry retains its separate 6.45M / 3.27M sets. Rendering pauses while idle.
- Responsive tablet layouts, larger touch targets and iPad home-screen installation support. The service worker caches previously visited systems for offline reuse in production.
- No tracking, external fonts, login or health-data collection. Saved data stays in the browser. Clearing site data removes local saves.

## Tablet and iPad priorities

Primary layouts: 11-inch iPad portrait/landscape (834×1194 / 1194×834) and 13-inch tablet layouts (1024×1366 / 1366×1024). The browser collapses into a drawer on narrower tablets, while the inspector remains independently scrollable. Touch controls use larger targets on coarse-pointer tablets; two-finger gestures pan/zoom the model. Actual iPad Safari, Apple Pencil and Android tablet performance remain to be tested on hardware.

## Sources and licences

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. Source archive: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/ . The current archive licence grants CC BY 4.0; historical source headers are retained in provenance.

The six selected lung/liver meshes are adapted Z-Anatomy geometry via the nqwrc 3d-anatomy conversion, licensed CC BY-SA 4.0. Required notices, contributors, changes and exclusions are in `public/models/supplement/LICENSE.txt`. Those adapted assets retain that licence. Their alignment is approximate; independent thoracic landmark discrepancies are 3–9.4 mm. They are an educational overlay pending anatomy review.

Selected skeletal notes paraphrase linked OpenStax Anatomy and Physiology 2e chapters. They have source links and are explicitly marked as awaiting clinical review. Personal annotations are user-authored, not medically reviewed content.

The detailed anatomy adaptation uses recovered model geometry, textures, labels, landmark anchors and muscle text. The project owner confirmed permission to extract and reuse this data on 24 October 2026. That assertion has not been independently verified and does not grant downstream users a blanket licence. No native executable, app software code, database-decoding material, UI/font textures or original Unity containers are shipped. See `public/data/atlas-provenance.json` and `evidence/ATLAS-EXTRACTION.md` for processing and review details.

## Verification and release boundaries

See `docs/QUALITY.md` for completed checks and outstanding release criteria, `docs/DATA_PIPELINE.md` for reproducible primary data processing, and the public provenance JSON for checksums, transforms, licences, categories and omissions. The open library derives from one adult male source; the Detailed Atlas additionally includes source urogenital specimens and muscle teaching details. Both require qualified anatomical review. Pathology, histology and clinical certification are absent. The Atlas muscle library uses a one-sided source dissection presentation and offers skeletal context. All authored native scene compositions and behaviors have not been recreated. Surface clipping is an uncapped geometry cut, not a CT/MRI reconstruction. Source categories and LOD detail require qualified review.

The latest interface checkpoint and browser QA coverage are recorded in `docs/RELEASE-QA.md`. Passing software checks does not establish medical accuracy or performance on untested physical devices.

## Deployment

The Vite `dist/` output can be hosted as static assets. `wrangler.jsonc` supports direct Cloudflare Workers Static Assets deployment. Each processed asset is under 25 MiB, so this checkpoint does not require R2 or Supabase. `.openai/hosting.json` identifies the private Sites deployment. Credentials, raw downloads, temporary tooling, dependencies and build output are excluded from Git.

Cloudflare Workers Builds is connected to `Anshmaan29/3d-anatomy`, production branch `main`, with root `/`, build command `npm run build`, and deploy command `npx wrangler@4.152.0 deploy`. Preview builds are disabled. The selected Cloudflare account and Worker name are fixed in `wrangler.jsonc`; deployment tokens remain in Cloudflare. See `docs/CLOUDFLARE-DEPLOYMENT.md` for the deployment record and acceptance scope.

GitHub checkpoint destination: https://github.com/Anshmaan29/3d-anatomy . Push major completed checkpoints with validation notes; never push credentials or unrelated local files.
