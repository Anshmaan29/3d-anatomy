# Atlas 7.2 extraction checkpoint — 24 October 2026

The project owner explicitly confirmed permission to extract and reuse the installed
Atlas data in this project on 24 October 2026. This records the owner's assertion;
it is not independent verification of a licence or an additional licence grant.

## What was actually recovered

The installed `/Applications/Anatomy 3D Atlas.app` was inspected read-only.
UnityPy 1.25.4 decoded **all 4,234 Mesh objects**: 4,586,919 vertices and
7,518,721 triangles, with finite positions and in-range triangle indices.
Compressed NPZ geometry archives total **127,930,558 bytes**. All 39,964 Transform
objects and 38,143 MeshFilter/MeshRenderer objects were parsed successfully.
Scene instances are duplicated; they are not extra anatomical structures.

The mesh total includes **2,216 coded anatomical surfaces** (1,985 primary model
IDs and 231 MH alternate surfaces), **2,004 coded landmark meshes**, four
unmapped digestive landmark meshes, one generic marker cube, and nine internal
heart meshes. Marker meshes must not be counted as additional organs.

Native symbols and targeted offline ARM64 disassembly identified the catalog's
actual loading/decoding path. Source-bound IL2CPP metadata provided its embedded
asset-decoding field. The decoded UTF-8 SQL is **3,642,775 bytes**, SHA-256
`55af193ea1a93ed9a649f09682cd34880609b648f75d2e0e3d6fb45983bf078b`.
The script keeps decoding material in memory and does not export it.
No app, entitlement, purchase or original source file was modified.

Catalog recovery includes:

- 1,985 anatomical model rows from 16 model tables; all matched to coded surfaces.
- 1,002 landmark rows, matched to 2,004 P/PA marker meshes.
- 280 English muscle detail records: origin, insertion, innervation, blood supply,
  action. There are 3,080 detail rows across 11 languages.
- 69 scenes, 16 groups, four regions, 82 viewpoints and muscle layers 1–10.
- English/Latin labels and source translations. No labels inferred from shape.

**697 native-size texture PNGs** decoded from 708 Texture2D objects, totaling
**436,803,757 bytes**. The other 11 objects are empty font-texture placeholders;
there were zero texture decoding failures. All 139 distinct material normal-map
targets use DXT5 alpha/green packing; web normal maps reconstruct the missing Z
component. The recovered BC6H image is an 8-bit preview rather than retained HDR.

## Evidence and reproducibility

REA supplied shipped-artifact identity/inventory evidence:
`ev_d1b9e701201882a347158b502f330066c2d142b9022e648966f97f58f106d3d4`.
Bundle digest:
`f87ac4fba4a1c5c9a288296447ea03488611d6f645228fb6644242f0d5102548`.

The geometry counts, catalog recovery and texture decoding above are separate
Python/UnityPy/Capstone observations, not results claimed from a REA decompiler.
Ghidra/Hopper/IDA were unavailable. Targeted symbol-driven disassembly did not
require those providers. Raw evidence and original-resolution extracted data are
retained under ignored `data-source/atlas-analysis/`.

Scripts:

1. `inspect-atlas-assets.py --data <app Data directory> --output <analysis/decoded> --geometry`
2. `extract-atlas-textures.py --data <app Data directory> --output <analysis/textures>`
3. `inspect-atlas-catalog.py` inventories version-specific metadata.
4. `recover-atlas-labels.py --help` documents reproducible catalog recovery.
5. `export-atlas-web.py` and `optimize-atlas.mjs` prepare the web adaptation.

## Integration and limits

Web surfaces retain source transforms, vertex normals, UVs, material bindings and
English/Latin labels. Unity coordinates are converted together to a fixed common
body frame; organs are not independently centered. Shared albedo/normal images
have content-addressed paths. Meshopt compresses geometry; high quality retains
original triangle topology. Balanced mode applies bounded simplification only
to larger surfaces outside cardiovascular, nervous and lymphatic systems.
Alternate surfaces/sections start hidden and remain selectable.

Nine internal-heart meshes use their owning anatomical ancestor's catalog label;
they are additional surfaces, not nine newly identified organs. Unmapped digestive
pins are retained only in local extraction, with no invented public labels.
The adaptation approximates Unity Standard shading with glTF PBR; source detail
and specular shaders are not exactly reproduced. Geometry and source medical
text have not been independently reviewed by a qualified anatomy professional.
This extraction is substantially deeper than the earlier limited investigation;
it is not a claim of complete feature parity or clinical readiness.
