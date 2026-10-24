# Reference investigation — 24 October 2026

Target supplied by user: `/Applications/Anatomy 3D Atlas.app`.

## Observed with REA

- `open_binary` resolves the app to the ARM64 Mach-O executable at `Contents/MacOS/Anatomy 3D Atlas`; SHA-256 `fcb983b3ad8fb0b54412d192e0581368e56087917d484c52077750a9d57f8f25`.
- `inspect_plist`, Evidence `ev_7a8a7097ee1c5efe4e61889da1dc2422f0321bb0986e2b839dc447c09c36db6d`: version 7.2, build 720, bundle ID `com.catfishanimationstudio.MuscularSystemMacLite`; Unity Player 6000.4.2f1.
- `inspect_artifact`, Evidence `ev_d1b9e701201882a347158b502f330066c2d142b9022e648966f97f58f106d3d4`: static application inventory, manifest `agm_3650969f74862a71a3364e6fce4f679abdd23c8567fcc2f26226226fc4b2bf21`. Bundle root SHA-256 `f87ac4fba4a1c5c9a288296447ea03488611d6f645228fb6644242f0d5102548`. Inventory substep Evidence `ev_5fefdb84213a3a8007bf4cbf1952386533dcde13d637b4ad378794dffd2d5b8a`.
- Inventory graph: 450 content nodes, 512 occurrences, 487 edges. This counts graph objects, not selectable anatomy.
- Supplemental read-only filesystem inventory: 327 regular files, 1,515,896,208 bytes. Large resources include `resources.assets` (396,005,328 bytes), `resources.assets.resS` (604,153,328 bytes), and `GameAssembly.dylib` (196,603,088 bytes).
- Serialized asset header independently reports file version 22 and Unity 6000.4.2f1. The `.casdb` catalog is an opaque binary carrier, not a recognized plaintext SQLite header. Its schema and semantic contents have not been established.
- Native UI observation through the computer-use tool reached the first-run welcome screen with Continue and links to privacy/terms. No paywall or licensing flow was completed. No claimed runtime verification of the vendor's atlas tools follows from this observation.

## Public feature evidence

The vendor's https://anatomy3datlas.com/features/ documents rotation, selection, transparency, muscle layers, pins, centering, isolation, hiding, multi-selection, search and bookmarks. These are reference requirements, independently implemented in this web project; this webpage is not shipped-binary execution evidence. General system and body-region organization was also read on https://anatomy3datlas.com/.

## Reconstruction decisions

Use independent React/Three.js implementation and the redistributable BodyParts3D source catalog and mesh geometry. No vendor meshes, textures, binary catalog, executable code, branding, screenshots or paid descriptions are included in the website. Static package inspection does not grant a redistribution licence for those assets. The website uses real source surfaces instead of invented procedural anatomy.

## Coverage and remaining gaps

Answered: target identity, packaging technology, model-carrier inventory, public interaction requirements, viable open model source.
Partially answered: UX reference (public documentation and first-run window; full paid app interaction was not observed).
Unresolved: proprietary mesh decoding, original source recovery, paid system coverage, anatomical parity with the reference. Those are not prerequisites for this independent open dataset build. No claim of exact parity, medical certification, or best-in-market status is made. The REA session was closed after inspection.
