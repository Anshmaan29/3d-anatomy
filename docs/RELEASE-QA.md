# Open Anatomy interface checkpoint — 24 October 2026

This is a verified software checkpoint, not a claim of clinical certification or universal hardware compatibility.

## Delivered behavior

- A single student workspace named Open Anatomy uses the Atlas adaptation. The former two-library selector is removed. Archived assets and explicit legacy links are retained.
- Every fresh page opening presents High, Balanced and Low power radio cards. The browser remembers the selection. Neither the 3D canvas nor model catalog loads until continuing; Settings can change quality later. Balanced is recommended. Low power uses balanced geometry and pixel ratio 1.
- Revision ratings explicitly say when the card is due again; they schedule local review, rather than start a timer or send notifications.
- Structure scrolling and sticky region controls stay above the footer. Mobile drawer dismissal targets the uncovered area, and tab navigation closes the drawer. Touch controls fit compact viewports.
- Group focus, isolation transitions, system framing, prepared-view titles, light/dark contrast and export branding were corrected.
- Offline preparation includes lazy viewer scripts, styles and fonts. The PWA manifest updates online and falls back to its cached copy offline.

## Verification

| Area | Result and scope |
| --- | --- |
| Automated suite | 44 checks passed, including independent decoding of all 54 Atlas GLBs, catalog/node mappings, routing, review scheduling, graphics migration, cache failures and lazy-code offline preparation. |
| Production build | TypeScript and Vite build passed. |
| Dependencies | `npm audit --omit=dev`: zero findings at this checkpoint. |
| Graphics | All three choices exercised; preference survived reload; startup gate held the canvas until continuation. |
| Catalog | All 10 systems loaded; all 13 internal collections and all 19 guided steps exercised with visible structure counts. |
| Exploration | Search across systems, selection, multiple selection, focus, zoom, orientations, reset, clipping/flip, exploded view, hide/isolate/undo, opacity and muscle depth exercised. |
| Study | Muscle comparison, deck addition/filter/reveal/rating, next-review status, practice grading/next/restart and disabled practice labels exercised. |
| Saved work | Bookmark, exact group view restore, JSON download, anchored annotation after orbit, annotated PNG download and share-link confirmation exercised. Exported JSON and PNG were inspected. |
| Layout | Observed CSS viewports included 325×703, 390×844, 468×1013, 834×1194 and 1194×834. No horizontal document overflow; popup action remained reachable. Both light and dark themes inspected. |
| Keyboard | Modal focus containment, including reverse Tab, checked; startup Escape continues with selected graphics. |
| Offline | Saved 46 files plus app shell and lazy viewer dependencies. With the production preview server stopped, a full page reload showed the graphics popup with no canvas, then rendered the 40-surface internal heart view after continuing. |
| Publishing | Public Cloudflare deployment requested and completed separately; the earlier Sites preview remains owner-private. GitHub contains the reviewable source checkpoint. See CLOUDFLARE-DEPLOYMENT.md. |

Checks used a desktop in-app browser and CSS viewport emulation. These are not physical-device FPS, thermal, memory-pressure, Apple Pencil or Safari installation measurements. The matrix records exercised flows, not an exhaustive proof that every possible state is defect-free.

## Remaining acceptance work

Qualified anatomical review is still required, including source laterality conflicts, label placement and internal anatomy coverage. Physical iPad Safari and mainstream Android testing, sustained FPS/memory measurements, PWA installation checks and a full accessibility audit remain pending. Surface clipping remains uncapped, and native Atlas feature/shader/camera parity is not claimed. Source permissions and attribution continue to apply; the Atlas adaptation is not presented as an open licence for downstream redistribution.
