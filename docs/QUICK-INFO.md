# Easy-English side-panel explanations — 27 October 2026

Selecting a structure now shows **In simple words** directly below its name and identity pills, before selection controls. The card contains two short sentences, an expandable reference, and medical-review status. Existing source muscle attachments, actions, landmarks and annotations remain below it.

## Coverage and limits

All **3,885 catalogue entries** return a card: 2,225 Atlas surfaces, 1,654 archived BodyParts3D entries and six supplementary organ surfaces. These are selectable entries, not a count of unique anatomical parts.

- 1,098 entries match an authored organ, structure or named-family overview.
- 146 use a shortened source-listed muscle action, with the complete original retained below. Unsupported or sex-dependent actions fall back to context instead of an invented translation.
- 2,442 receive explicitly labelled tissue/type context; 199 receive explicitly labelled system context. These are **not** individually written functions for each tiny branch.
- Every explanation is educational, AI-assisted and **pending medical review**. An unresolved identity receives an identity warning rather than an assigned function.

The resolver deliberately does not infer a supply territory from a nerve/artery name or an organ location from catalogue coordinates. Vessels are classified before the organ in their name. Brain fluid spaces, heart chambers, cardiac conduction nodes, meninges, cartilage and organ-supporting ligaments retain distinct explanations.

## References

Original short wording uses the [NIH/NCI anatomy training modules](https://training.seer.cancer.gov/anatomy/) for general anatomy, [NEI](https://www.nei.nih.gov/eye-health-information/healthy-vision/how-eyes-work) for vision, [NIDCD](https://www.nidcd.nih.gov/health/how-do-we-hear) for hearing and [NIMH](https://www.nimh.nih.gov/news/media/2023/get-to-know-your-brain) for cerebellar coordination. Each card links its relevant reference. Muscle actions retain their source-catalogue provenance. References are learning resources, not evidence of clinician sign-off on this adaptation.

## Verification

- Full automated suite: **56 tests passed**. New checks cover every catalogue entry, concise length, source/review fields, pulmonary vessel exceptions, renal vessels, brain/heart ventricles, choroid plexus, meninges, spinal cord, cardiac conduction, ligaments and unresolved identities.
- TypeScript and production build passed. No new dependency, API request, model asset or camera change.
- Browser checks: femur (legacy deep link), corpus callosum (Atlas), and biceps with full source details retained. Source disclosure expanded/collapsed; changing theme preserved selection; no console errors observed.
- Layout inspected at desktop, 820 × 1180 iPad portrait, 1180 × 820 tablet landscape and 390 × 844 phone viewports. Phone details opened from its existing selected-part button; document width stayed within 390 px. Light and dark modes inspected.
- These are browser viewport checks. Physical iPad/Android and clinical review remain outstanding.

The content is bundled with the app, so it adds no per-selection network dependency and is available with the cached application when studying offline.

The sidebar’s bottom “Open Anatomy / Dataset & attribution” tile was removed at the owner’s request. Credits and licences remain accessible from Settings, with selected-model provenance also available in the inspector.
