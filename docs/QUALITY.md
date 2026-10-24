# Verification and release status — 24 October 2026

## Completed

- Six automated asset checks: unique catalog identities; selectable mesh mapping; patient laterality and anterior orientation; hosting file limits and no proprietary packaged assets; balanced LOD identity preservation and triangle reduction; separately licensed supplementary organs.
- Three.js GLTFLoader and MeshoptDecoder validation of all twenty primary GLBs: finite vertices/normals, indexed geometry, mapped names and expected system membership. Supplementary six nodes separately decoded and world bounds checked.
- Explicit source classification regressions for muscle heads, ocular anatomy, wrist retinacula, eyelid tarsal plates, lumbar regions and pancreatic ducts.
- TypeScript production compilation and Vite build.
- npm audit: zero reported vulnerabilities across application and development dependencies at this checkpoint.
- Browser observation: actual skeleton/femur rendering, search and source metadata, focus, orientation presets, isolation, annotations following rotation, annotation reload persistence, bookmark persistence and exact camera view save/restore. Annotated PNG export inspected visually.
- Practice mode presented four choices, suppressed labels and the structure list, graded an answer and updated its score. Browser warning/error log was empty at the observed checkpoint.
- Narrow browser layout observed at 325 CSS pixels with no horizontal document overflow. Tablet breakpoints and touch-target rules are implemented. iPad-sized browser layouts checked without horizontal overflow: 834×1194 (542px model canvas), 1194×834 (697px), 1024×1366 (507px), and 1366×1024 (819px). Inspector panels remain independently scrollable. These are CSS viewport checks, not physical iPad certification.

## Required before a market-ready medical education release

- Qualified anatomy review of labels, inferred categories/regions, geometry/landmarks, side mappings, all model omissions, LOD loss and supplemental organ alignment.
- Expand source-based, professionally reviewed MBBS content: origins, insertions, actions, innervation, blood supply, relationships and clinical correlations. The current small set of skeletal notes is not a complete MBBS curriculum.
- Physical iPad Safari tests in portrait/landscape, touch/Apple Pencil annotation placement and virtual-keyboard behavior; physical iPhone and mainstream Android/tablet tests.
- Measure cold/warm network transfer and frame times on named hardware, reduced network profiles and memory over repeated switching. Triangle/file counts are measured; a hardware FPS claim is not made.
- Verify install/offline/update behavior on actual Safari and Chrome PWA installations. Offline reuse currently caches visited systems; it does not pre-download the entire atlas.
- Broader accessibility review with screen readers and touch users, including high zoom and annotation collision/occlusion behavior.

## Interpretation

A working independently built preview with transparent source limits. Not an exact clone or a medically certified atlas; not a claim of complete anatomy, clinical accuracy, device certification or best-in-market performance. Model source licences permit the included distribution with attribution, which is retained in the app and repository.

## Detailed Atlas checkpoint — 24 October 2026

- Full static mesh decode: 4,234 mesh objects; 4,586,919 vertices; 7,518,721 triangles;
  zero geometry/transform decoding failures.
- 1,985 catalog model records, 280 English muscle detail records; 697 native PNGs.
- Web adaptation: 2,225 selectable surfaces, 979 associated landmarks, 23 explicitly
  unassociated source anchors. Markers/variants are not counted as unique organs.
- Ten automated checks pass, including independent Meshopt buffer decoding and
  triangle/vertex integrity, every source node, spatial bounds, texture paths,
  bilateral skeletal anchors and landmark associations.
- Four source English/Latin atrial laterality conflicts are flagged; conflicting
  Latin is withheld. 110 landmark association disagreements resolve through
  explicit scene ancestry; sources remain recorded.
- Browser checks: source switching, high-resolution texture rendering, muscle
  details, landmark search/focus, moving 3D labels, progress and tablet layout.
- Pending: physical iPad/Android GPU/FPS/load measurements, full offline acceptance,
  clinical review, and exact recreation of all native scene/UI behavior.
