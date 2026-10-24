# Checkpoints

## 1 — Working anatomy workspace

Real open anatomy and model ingestion, source investigation, 3D viewer, search, layers, visibility, isolation, study metadata, practice, locally saved exact views/bookmarks and source attribution. Surface-anchored annotations follow the mesh in 3D and persist locally; annotated image export verified.

Validation: six asset tests, all twenty primary GLBs decoded, six supplemental nodes validated, TypeScript/Vite production build, zero npm audit findings. See docs/QUALITY.md for scope and required medical/device review.

## 2 — Tablet/iPad focus and cloud preview

Touch-target and input sizing for tablets; portrait inspector/drawer layout; iOS safe-area support and standalone PWA metadata. Cloud preview and this repository preserve the reviewable checkpoint. Four portrait/landscape CSS viewport checks passed without document overflow. The camera now frames each active system automatically so smaller organs remain useful on a tablet. Physical iPad acceptance remains pending.

## 3 — Published checkpoint and update-safe offline cache

Private preview published at https://anatomy-studio-mbbs.aurorayew128.chatgpt.site . Model URLs and the offline cache now use a digest of actual geometry/catalog bytes, so a new anatomy dataset does not reuse old unversioned model caches. Earlier dataset caches are removed when the new service worker activates. GitHub main contains all application sources, processed models, licences, pipeline scripts and verification records.
