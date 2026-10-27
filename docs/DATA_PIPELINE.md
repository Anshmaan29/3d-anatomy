# Anatomy Studio model provenance

The application uses actual **BodyParts3D 4.0** anatomy meshes, acquired from the
official LSDB Archive on 24 October 2026. The detailed anatomy library also
includes adapted geometry, textures and text from a separate source.

Official dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/

Download table: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html

Current license: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html

The current archive license page, updated **27 February 2025**, grants CC BY 4.0.
Required attribution:

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International

The 2013 OBJ archive still embeds the historical CC BY-SA 2.1 Japan notice. These
original headers are retained in the downloaded archives. The release relies on
the current explicit license grant from the archive, and records the historical
notice in `public/data/licenses.json` and `public/data/provenance.json`.

## Rebuilding

Run from this project directory. Source archives and TSV tables live in
`data-source/bodyparts3d/`; original ZIP archives remain unchanged. Downloaded
file SHA-256 digests are recorded in the public license manifest.

To obtain a fresh copy, download these files from
`https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/`:

- `isa_BP3D_4.0_obj_99.zip` (142,903,898 bytes)
- `partof_BP3D_4.0_obj_99.zip` (64,888,505 bytes; cross-check/reference only)
- `isa_parts_list_e.txt`, `partof_parts_list_e.txt`
- `isa_element_parts.txt`, `partof_element_parts.txt`
- `isa_inclusion_relation_list.txt`, `partof_inclusion_relation_list.txt`
- `README_e.html`

Keep snapshots of the current license and download pages as `license.html` and
`download.html`. The IS-A archive is the render source, covering more anatomy
than the smaller PART-OF archive. No proprietary model extraction is required.

```sh
python3 scripts/ingest-anatomy.py
npm install --prefix data-source/tooling --no-save --package-lock=false --ignore-scripts @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
node scripts/optimize-anatomy.mjs
node scripts/ingest-anatomy-lod.mjs
```

Python uses its standard library; optimization dependencies stay under
`data-source/tooling/` and do not alter the application package. Intermediate
uncompressed GLBs stay in `data-source/generated/`. Only `public/` is published.

## Transform and identity

The current build has 1,654 selectable concepts from 2,229 original elements.
Five outer covering meshes (skin, ear, eyebrow, head hair and pubic hair) are
excluded. All included elements have official source mappings.

Source coordinates are millimetres, Z superior, anterior -Y and patient-right
-X. Exported world coordinates use `(x,z,-y)` with one common center and uniform
scale. Whole-body height is 3.5 units, superior +Y, anterior +Z and patient-right
-X. The transform is a proper rotation; triangle winding is preserved. Original
smooth vertex normals receive the same rotation. Missing normals are recomputed
from geometry; invalid normal references fail ingestion.

Every original element OBJ is processed once. Its header supplies the FMA
concept ID, English label and BP representation ID. Elements sharing an exact
concept ID are concatenated into one selectable node named `FMA...`. If a header
has blank identity fields, the official element table provides a recorded
fallback. Compound concept definitions are used for classification only, never
to duplicate surfaces.

Meshes retain original triangles, are indexed, use shared PBR materials, then
receive meshopt compression (16-bit position / 12-bit normal quantization). No
additional polygon reduction is performed for high-detail GLBs. Each system
remains below the 25 MiB static asset limit. Metadata bounds use normalized
world coordinates.

`public/models/balanced/` contains a separately documented mobile LOD. It keeps
every named structure. Primitives below 2,048 triangles or 0.03 world units
maximum extent remain unsimplified. Larger primitives target 40% of triangles,
with a 0.002 relative error ceiling and locked borders. Actual total geometry
falls from 6,445,860 to 3,274,926 triangles. This ratio is constrained by topology
and error rather than deleting structures. Detail preservation requires medical
and target-device evaluation; these settings are engineering bounds only.

## Quality boundaries

This is a single adult male-derived anatomical dataset. Female reproductive
anatomy, pathology, histology and microanatomy are absent. Gross lung parenchyma,
full liver surfaces and a thyroid gland surface are absent as individual source
elements. Respiratory and liver compounds contain detailed bronchial, vascular
and biliary components. The source spinal cord compound maps the central canal
only. No fake gross organ surfaces are substituted. The reduced-resolution
source cannot provide commercial photographic textures. Source identifiers and
labels are preserved; system categories supplement incomplete source compound
definitions with explicit software rules and remain unreviewed. Regions are
spatial navigation aids. Medical review is pending. Source-attributed geometry
does not establish clinical accuracy or curriculum completeness.

## Owner-authorized Atlas pipeline (24 October 2026)

This is a separate library; it is not spatially overlaid onto BodyParts3D. Local
raw recovery is under ignored `data-source/atlas-analysis/`. Required Python
tooling: UnityPy 1.25.4, numpy, Pillow, pycryptodome and capstone in a dedicated
venv. glTF optimization uses the existing ignored glTF-Transform/meshoptimizer
tooling directory. Run extraction scripts with `--help` for explicit paths:

1. `scripts/inspect-atlas-assets.py --geometry` → decoded arrays, hierarchy and bindings.
2. `scripts/extract-atlas-textures.py` → native PNGs and texture/material manifest.
3. `scripts/recover-atlas-labels.py` → validated source SQL, model/landmark mapping.
4. `scripts/export-atlas-web.py` → shared web textures, uncompressed GLBs and catalog.
5. `node scripts/optimize-atlas.mjs` → compressed high/balanced GLBs and provenance.
6. `scripts/export-atlas-landmarks.py` → associated and explicitly unassociated anchors.
7. `npm test && npm run build`.

Source-identity hashes and actual recovery counts are in the public provenance
and `evidence/ATLAS-EXTRACTION.md`. Reuse authorization is the owner's explicit
confirmation; this is not an independently verified open-data licence.
