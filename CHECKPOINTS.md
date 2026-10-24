# Checkpoints

## 1 — Working anatomy workspace

Real open anatomy and model ingestion, source investigation, 3D viewer, search, layers, visibility, isolation, study metadata, practice, locally saved exact views/bookmarks and source attribution. Surface-anchored annotations follow the mesh in 3D and persist locally; annotated image export verified.

Validation: six asset tests, all twenty primary GLBs decoded, six supplemental nodes validated, TypeScript/Vite production build, zero npm audit findings. See docs/QUALITY.md for scope and required medical/device review.

## 2 — Tablet/iPad focus and cloud preview

Touch-target and input sizing for tablets; portrait inspector/drawer layout; iOS safe-area support and standalone PWA metadata. Cloud preview and this repository preserve the reviewable checkpoint. Four portrait/landscape CSS viewport checks passed without document overflow. The camera now frames each active system automatically so smaller organs remain useful on a tablet. Physical iPad acceptance remains pending.

## 3 — Published checkpoint and update-safe offline cache

Private preview published at https://anatomy-studio-mbbs.aurorayew128.chatgpt.site . Model URLs and the offline cache now use a digest of actual geometry/catalog bytes, so a new anatomy dataset does not reuse old unversioned model caches. Earlier dataset caches are removed when the new service worker activates. GitHub main contains all application sources, processed models, licences, pipeline scripts and verification records.


## 4 — English internal anatomy and MBBS revision

Recovered 70 native scene memberships (69 catalog scenes plus full body) and all 82 source viewpoint targets. Added 13 inside-organ collections and 19 guided visibility steps using exact source meshes: deep brain/ventricles, heart chambers/valves/conduction, kidney/nephron, ear, eye, ducts, airways and segmental bronchi. Cameras fit canonical geometry; native camera poses and complete atlas parity are not claimed. See docs/INTERNAL-ANATOMY.md.

Dark/light/system themes, multiple selection, group hide/isolate, per-selection opacity, undo visibility, saved clipping settings, deep-linked guided steps, screen-laid-out anchored labels, and 3,196 source-derived revision cards with local review scheduling and muscle comparison. Hidden-only chunks are no longer requested, concurrency is bounded, BVH picking is deferred and GPU resources are leased/released across switches. Low-power mode reduces resolution.

Validation includes independent source-asset checks, scene/selection routing, label layout, revision scheduling and offline failures. Physical iPad/Android FPS, PWA installation and qualified clinical review remain pending. Offline browser acceptance and deployment evidence are recorded in docs/QUALITY.md.

Offline production acceptance passed locally after a Vary-header cache correction: downloaded heart view rendered 40 surfaces with the server stopped; guided valve reload rendered 2, and the uncached kidney view failed explicitly. 39 automated checks and the production build passed.

## 5 — Open Anatomy interface and graphics onboarding

One normal library, named Open Anatomy, replaces the dataset dropdown. Archived source assets and explicit legacy links remain recoverable. Every fresh page opening offers High, Balanced and Low power before loading the 3D viewer, remembers the choice, and permits changing it later in Settings. Review buttons now explain when a card becomes due again.

Fixed sidebar/footer overlap, mobile drawer dismiss targets and navigation, compact touch controls, group focus/isolation transitions, framing on system changes, and contrast in both themes. Offline preparation follows lazy viewer code and styles; the PWA manifest refreshes online with an offline fallback.

Validation: 44 automated checks, production build, zero production dependency audit findings; browser coverage of 10 systems, 13 internal views, all 19 guided steps, study/save/export/annotation controls, and phone/tablet portrait and landscape layouts. The latest production build reloaded from cache and rendered the 40-surface heart view with the local server stopped. See docs/RELEASE-QA.md for evidence and limits. Physical-device acceptance and qualified anatomy review remain release requirements.

## 6 — Public Cloudflare deployment

Published at https://open-anatomy.anshmaansingh.workers.dev in the owner's selected Cloudflare account. GitHub `main` is connected to Workers Builds; Cloudflare builds and deploys the complete static app and processed models. Preview branch builds and version URLs are disabled. Deployment authentication stays in Cloudflare under a separately approved build token.

The initial cloud build passed and uploaded all assets. Public browser checks verified graphics onboarding, skeletal and internal anatomy delivery, deep links and explicit offline file preparation. The earlier Sites preview remains owner-private. See docs/CLOUDFLARE-DEPLOYMENT.md for release identifiers, verification boundaries and the inactive Worker left by the timed-out dashboard upload.

## 7 — Zoom/orbit interruption fix

Manual mouse/touch input now takes ownership of the camera immediately after system changes, focus and scripted zoom. Automatic movement cannot keep pulling the camera back during a gesture. Scripted transitions drain residual damping, handle an idle demand-rendered canvas safely, and repeated zoom-button presses accumulate. Triangle picking is skipped during orbit gestures and wheel zoom; ordinary mesh selection resumes afterward.

Validation: 50 checks passed, production build passed, and browser zoom/orbit/selection checks covered both Atlas and archived open anatomy. See docs/RELEASE-QA.md for the regression scope.
