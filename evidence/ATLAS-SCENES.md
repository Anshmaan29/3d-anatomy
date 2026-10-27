# Atlas source scenes and inside-organ views

Date: 24 October 2026. Target: installed source application, version 7.2, build 720.
The project owner confirmed permission to extract and reuse its data. This report
covers scene reconstruction and teaching-view arrangements; it does not claim
independent clinical review or exact runtime feature parity.

## What is recovered and usable

- All **69 catalog scene records** match one native level root by exact normalized
  English title. A seventieth native root is the full-body composition, not a
  missing catalog record.
- **70 native visibility presets** resolve actual anatomical MeshFilter references
  through each level's external-file table into `resources.assets` mesh IDs.
- Visibility uses both `GameObject.m_IsActive` through every ancestor and the
  actual `MeshRenderer.m_Enabled` flag read with UnityPy. Merely finding a model
  name or a scene title is not counted as proof of visibility.
- All **82 catalog viewpoint records** have matching `Pov_<number>` native markers
  in the corresponding level. There are 92 such markers in total; ten have no
  matching catalog POV record and are not promoted into invented named views.
- For every recovered native anatomy scene, its mapped mesh instances share a
  common scene-to-canonical placement transform (100% agreement when rounded to
  three decimals). The 82 marker reference points are transformed back into the
  canonical exported coordinate system using this alignment, then the existing
  scale 0.2 / mirror-Z / translate-Y -1.7 registration.
- Viewpoint `target` is an anatomical marker reference point, **not** a recovered
  camera pose. `focusIds` selects nearby visible exported structure bounds. Web
  cameras fit these bounds. Native camera orientation, distance and runtime
  hide/peel changes have not been inferred from these markers.

The web manifest is `public/data/atlas-scenes.json`. `scenes` contains native
presets; `collections` contains directly openable curated presets of the same
shape. Each has `id`, `name`, `region`, `systems`, `visibleIds`, `focusIds`,
`category`, `description`, `cameraMode` and `sourceEvidence`. Native entries add
`memberIds`, `sourceHiddenIds` and nested `viewpoints`. Each source level is
identified by its SHA-256 in `sourceEvidence`.

## Inside organs

Thirteen English-only curated views select exact recovered source IDs:

| View | What is exposed |
| --- | --- |
| Brain, deep structures | Thalamus, basal nuclei, amygdala, fornix, commissures, choroid plexus and sectioned brainstem; hemispheres and dural folds removed |
| Brain, ventricular system | Combined ventricular surface, fornix and choroid plexus |
| Brain, medial view | A hemisphere with sectioned brainstem and deep structures |
| Circle of Willis | Source-labeled arterial circle, brainstem and optic tract |
| Heart, chambers and valves | Sectioned atria and ventricles, their internal surfaces, AV valves, coronary vessels and conduction structures |
| Heart, conduction pathways | Source-modeled nodes, internodal tracts, His bundle and branches within sectioned chambers |
| Kidney, pelvis and medulla | Pelvis, medullary pyramids, papilla, nephron and vessels, with outer surface and sinus fat removed |
| Nephron | The source nephron teaching representation |
| Ear | Tympanic membrane, ossicles, cochlea/vestibule, semicircular canals and vestibulocochlear branches without the skull shell |
| Eye | Iris, pupil, retina and optic nerve without the eyeball shell |
| Pancreatic ducts | Main/accessory pancreatic ducts alongside duodenum and gallbladder; pancreas surface removed |
| Larynx and airways | Native laryngeal cartilages, ligaments, muscles and tracheobronchial tree |
| Segmental bronchi | Twenty source-labeled segmental bronchial branch meshes without the two outer lung shells |

Five views include **19 ordered visibility steps** for guided study: brain,
heart, kidney, ear and eye. These are educational arrangements using source
geometry, not medical treatment guidance.

`Uro_M107`, labeled “Nephron” by the source, was independently checked as decoded
geometry: **13,312 vertices and 25,088 triangles**. Orthogonal projection of its
recovered mesh shows looped tubules, rounded corpuscle shapes and a branching
collecting structure. It is distinct from the pyramid meshes `Uro_M104/105`.
The combined mesh does not offer separately labeled microscopic substructures.
The local diagnostic image remains under ignored `data-source/atlas-analysis/`.

Orthogonal projection also verifies that `Res_M102/M112` are branching bronchial
tubes; their source labels describe the supplied lung segments, rather than
indicating solid segment-volume meshes. The curated name is therefore
“Lungs, segmental bronchi”. `Dig_M12` is a branching pancreatic duct mesh.

The independent high-resolution kidney specimen `Uro_M101` through `Uro_M110`
has canonical resource root `Uro_Kidney_HighRes`. These ten models are found only
in native scene 603 (Kidney, Section), absent from the full-body scene and every
other recovered anatomy scene. Their exported teaching placement is around
Y=-1.7, distinct from the body-position kidneys `Uro_M1/M2`. The manifest exposes
their IDs as `specimenOnlyIds` so whole-body mode can hide that separate specimen
while presets and search still open it.
The separate `uninstancedSurfaceIds` field lists 233 exported resource surfaces
that do not occur in any of the 70 native anatomy level memberships. This is a
bounded static observation; it does not assert that native runtime code can
never instantiate them. Most are alternate/hidden surfaces; `Uro_M11/12` are
simplified unused bladder/prostate alternates.

## Evidence boundaries and reproducibility

REA establishes the shipped artifact identity and package inventory. Its retained
`inspect_artifact` Evidence is
`ev_d1b9e701201882a347158b502f330066c2d142b9022e648966f97f58f106d3d4`;
bundle root SHA-256:
`f87ac4fba4a1c5c9a288296447ea03488611d6f645228fb6644242f0d5102548`.
The membership, active flags, marker transforms and counts above are subsequent
format-aware **UnityPy and SQLite observations**, not native decompilation or
observed runtime execution. The parent investigation owns the REA session; no
second native session was opened for this work.

Rebuild with the existing local analysis environment:

```sh
data-source/atlas-analysis/venv/bin/python scripts/build-atlas-scenes.py
node --test tests/scenes.test.mjs
```

The builder reads extracted arrays from `data-source/atlas-analysis/decoded`, the
recovered catalog from `labels/catalog.sqlite`, and the installed level files to
verify external references and renderer flags. Native inputs remain unchanged.
Local per-scene diagnostic counts are saved under
`data-source/atlas-analysis/scene-diagnostics.json`.

Four tests verify catalog/marker completeness, source ID and system consistency,
guided-step references, removal of obstructing shells in inside-organ views, and independent specimen exclusion from the full body.
Native model labels and combined surfaces remain source-derived; the manifest
does not invent absent anatomy, a separately labeled eye lens, histology or
unseen neural pathways. Visual QA and physical-device performance are separate
checks performed by the main integration task.
