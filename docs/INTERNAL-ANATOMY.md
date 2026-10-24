# Internal anatomy available in the web atlas

The English-only dissection library contains 70 reconstructed native visibility
presets, 13 inside-organ presets and 19 guided visibility steps. Every selectable
surface refers to recovered Atlas geometry and a source structure ID. This is an
educational atlas; source-derived labels and teaching arrangements still need
independent anatomy review.

| Inside-organ preset | Supplied selectable parts | Useful study task and boundary |
| --- | --- | --- |
| Brain, deep structures | 14 surfaces: sectioned brainstem; corpus callosum; fornix and its commissure; combined caudate/putamen; amygdala; medial/lateral globus pallidus; thalamus; anterior commissure; interthalamic adhesion; two choroid plexus surfaces; optic tract | Hide the cerebral shells to inspect deep relationships. Caudate and putamen share one surface; this is not a complete white-matter tractography dataset. |
| Brain, ventricular system | Combined ventricular surface, fornix and its commissure, two choroid plexus surfaces | Inspect ventricular shape and neighboring structures. The ventricular system is not split into every named passage as separate selectable meshes. |
| Brain, medial view | A source right-hemisphere surface, right cerebellar/floccular surfaces and the 14 deep structures | Study a one-hemisphere arrangement and remove individual surfaces. It does not simulate fresh anatomical cuts or supply a full histological section series. |
| Circle of Willis | Six source arterial-circle meshes, sectioned brainstem and optic tract | Inspect the arterial assembly in context. Branches may be combined in one source mesh; no vascular flow or anatomical-variation simulation is claimed. |
| Heart, chambers and valves | 40 source surfaces: sectioned atria/ventricles and internal surfaces, tricuspid/mitral valves, aorta/pulmonary artery, ligamentum arteriosum, coronary arteries/veins and conduction structures | Explore chamber interiors and nearby structures. Some surfaces are variants of the same named part, so 40 surfaces does not mean 40 distinct anatomical structures. |
| Heart, conduction pathways | 20 surfaces: chamber sections/internal surfaces, AV valves and ten conduction structures | Follow source-modeled SA/AV nodes, Bachmann bundle, internodal tracts, His bundle and branches. This is a static teaching representation, not an electrophysiological simulation. |
| Kidney, pelvis and medulla | Seven source surfaces: pelvis; full/sliced medullary pyramids; papilla; nephron; renal artery/vein | Remove the outer kidney and sinus fat. The renal cortex and nephron subparts are not independently named/selectable here. |
| Kidney, nephron | One combined source nephron mesh | View the looped tubules, corpuscle shapes and collector representation. No separately selectable glomerular capillaries, filtration barrier or tubular-cell histology is supplied. |
| Ear, middle and inner anatomy | Nine surfaces: membrane; malleus/incus/stapes; combined cochlea/vestibule; semicircular canals; cochlear/vestibular nerves and vestibular ganglion | Inspect gross hearing/balance anatomy after removing skull obstruction. The cochlea and vestibule share a mesh; no separately labeled organ of Corti or cochlear histology is present. |
| Eye, retina and iris | Four surfaces: iris, pupil, retina and optic nerve | Remove the outer eyeball shell. The source offers no separate labeled lens mesh or layered retinal histology. |
| Digestive, pancreatic ducts | Four surfaces: duodenum, main pancreatic duct, accessory pancreatic duct, gallbladder | Expose duct geometry after hiding the pancreas. This is not a complete separately labeled biliary tree or pancreatic histology dataset. |
| Respiratory, larynx and airways | 60 source surfaces including hyoid, laryngeal cartilages/ligaments/muscles, trachea and segment-labeled bronchial branches | Inspect gross laryngeal and airway anatomy. Some source labels identify lung regions even though their corresponding meshes are airway branches. |
| Lungs, segmental bronchi | 20 source-labeled bronchial branch meshes | Study the branches serving named source lung segments with the outer lung shells removed. These are tubes, not solid bronchopulmonary segment volumes; alveoli are not supplied. |

## How to study the interiors

Open an inside-organ preset to load its explicit visible structures and fit the
camera to them. Select a structure to identify it; hide or fade surrounding
surfaces to follow its relationships. Five presets provide ordered steps for
deep brain structures, heart chambers/valves/conduction, renal collecting parts,
ossicles/inner ear and retina/iris. Surface notes stay attached to the selected
model as the camera moves.

A section-plane tool clips existing meshes. It can reveal source-modeled inner
surfaces, but cannot generate missing tissue detail or turn a hollow shell into
a histologically accurate organ. Source section models and a geometric clipping
plane are different capabilities; no new clinical cross-section atlas is claimed.

## Data and interpretation limits

- Native scene membership and default visibility are verified statically from
  Unity external mesh references, renderer flags and active ancestor chains.
  Native runtime interactions and camera orientation/distance are adapted for
  the web. The 82 source viewpoint targets are recovered reference markers.
- The independent high-resolution kidney specimen is positioned separately from
  body-aligned kidneys. Whole-body mode hides its ten specimen surfaces;
  Kidney/Nephron presets still open them normally.
- Four source atrial records contain English/Latin laterality disagreements.
  English source labels are retained with data-quality notes; conflicting Latin
  is withheld. Laterality requires an anatomy reviewer before clinical sign-off.
- Several surfaces combine anatomical structures and some variants duplicate a
  named structure. Counts are surfaces, not a claim that every artery, nerve,
  tissue layer or microscopic component of the human body is separately modeled.
- No student should infer absent anatomy from a missing label or use these
  source-derived models for diagnosis, surgery planning or patient-specific
  measurement. Clinical explanations and exam claims require separate sources
  and review.

The exact preset IDs, source codes, source level hashes and selection rules are
in `public/data/atlas-scenes.json`, generated by `scripts/build-atlas-scenes.py`.
For extraction evidence and reproducibility, see `evidence/ATLAS-SCENES.md`.
