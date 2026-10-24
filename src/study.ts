import type { Structure, SystemId } from './types';

export interface StudyNote {
  title: string;
  description: string;
  points: string[];
  reviewed: false;
  reference: { title: string; url: string };
}

const pectoral = { title: 'OpenStax · 8.1 The Pectoral Girdle', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/8-1-the-pectoral-girdle' };
const lowerLimb = { title: 'OpenStax · 8.4 Bones of the Lower Limb', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/8-4-bones-of-the-lower-limb' };
const thorax = { title: 'OpenStax · 7.4 The Thoracic Cage', url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/7-4-the-thoracic-cage' };

const notes: { match: RegExp; note: StudyNote }[] = [
  { match: /\bclavicle\b/i, note: { title: 'Clavicle', description: 'The clavicle is an S-shaped bone at the front of the shoulder. Together with the scapula, it forms the pectoral girdle.', points: ['Its medial end articulates with the sternum.', 'Its lateral end articulates with the acromion of the scapula.'], reviewed: false, reference: pectoral } },
  { match: /\bscapula\b/i, note: { title: 'Scapula', description: 'The scapula is a flat, triangular bone on the posterior shoulder. It articulates with the humerus at the shoulder joint.', points: ['The scapular spine is a prominent ridge on its posterior surface.', 'The acromion joins the lateral end of the clavicle.'], reviewed: false, reference: pectoral } },
  { match: /\bfemur\b/i, note: { title: 'Femur', description: 'The femur is the single bone of the thigh. It connects the hip region to the knee.', points: ['The femoral head articulates with the acetabulum of the hip bone.', 'Distally, the femur articulates with the tibia and patella.'], reviewed: false, reference: lowerLimb } },
  { match: /\btibia\b/i, note: { title: 'Tibia', description: 'The tibia is the larger, medial bone of the leg and transmits weight between the knee and ankle.', points: ['The leg is the region between the knee and ankle.', 'The fibula lies lateral to the tibia.'], reviewed: false, reference: lowerLimb } },
  { match: /\bfibula\b/i, note: { title: 'Fibula', description: 'The fibula is the slender bone on the lateral side of the leg, alongside the tibia.', points: ['The tibia is the larger, medial bone of the leg.', 'Use an anterior view to compare their relative positions.'], reviewed: false, reference: lowerLimb } },
  { match: /\bpatella\b/i, note: { title: 'Patella', description: 'The patella is the kneecap. It articulates with the distal end of the femur.', points: ['Locate it on the anterior side of the knee.', 'Compare its position with the distal femur in a lateral view.'], reviewed: false, reference: lowerLimb } },
  { match: /\bsternum\b|\bmanubrium\b|\bxiphoid\b/i, note: { title: 'Sternum', description: 'The sternum anchors the anterior thoracic cage. Its three parts are the manubrium, body and xiphoid process.', points: ['The clavicle articulates with the manubrium.', 'The manubrium and body meet at the sternal angle.'], reviewed: false, reference: thorax } },
  { match: /\brib\b|\bribs\b/i, note: { title: 'Ribs', description: 'The thoracic cage contains 12 pairs of ribs, their costal cartilages and the sternum. It protects the heart and lungs.', points: ['Ribs 1–7 are classified as true ribs.', 'Ribs 11 and 12 are floating ribs.'], reviewed: false, reference: thorax } },
];

export function getStudyNote(structure: Structure): StudyNote | undefined {
  if (structure.system !== 'skeletal') return undefined;
  return notes.find(({ match }) => match.test(structure.name))?.note;
}

export const systemNames: Record<SystemId, string> = {
  skeletal: 'Skeletal', muscular: 'Muscular', cardiovascular: 'Cardiovascular',
  nervous: 'Nervous', respiratory: 'Respiratory', digestive: 'Digestive',
  urinary: 'Urinary', reproductive: 'Reproductive', lymphatic: 'Lymphatic', endocrine: 'Endocrine',
};

export const systemDescriptions: Record<SystemId, string> = {
  skeletal: 'Bones & supporting structures', muscular: 'Muscles & connective tissue', cardiovascular: 'Heart & blood vessels',
  nervous: 'Brain, spinal cord & nerves', respiratory: 'Airways & lungs', digestive: 'Digestive tract & organs',
  urinary: 'Kidneys & urinary tract', reproductive: 'Reproductive structures', lymphatic: 'Lymphatic organs & vessels', endocrine: 'Hormone-producing glands',
};

// Raw source codes are useful for provenance, but must not become exam answers.
export function hasUnresolvedAtlasLabel(structure: Structure): boolean {
  return structure.id.startsWith('ATLAS_') && (!structure.name.trim() || /unresolved|no english/i.test(structure.reviewStatus || '') || /\b(?:Art|Vei|Ner|Mus|Ske|Uro|Res|Lym|End|Lig|Dig|Bra|Hea|Int|Eye|Ear)_[A-Z]+\d+\b/i.test(structure.name));
}
export function isPracticeStructure(structure: Structure): boolean { return !hasUnresolvedAtlasLabel(structure); }

export function getMuscleDetails(structure: Structure): Array<{label:string;text:string}> {
  if (!structure.details) return [];
  const labels = { origin: 'Origin', insertion: 'Insertion', innervation: 'Innervation', action: 'Action', bloodSupply: 'Blood supply' } as const;
  return (Object.keys(labels) as Array<keyof typeof labels>).flatMap(key => { const text = structure.details?.[key]; return typeof text === 'string' && text.trim() && !/^n\/?a[. ]*$/i.test(text.trim()) ? [{ label: labels[key], text }] : []; });
}

export function applyMuscleLayer(structures: Structure[], hiddenIds: string[], layer: string): string[] {
  const hidden = new Set(hiddenIds);
  for (const structure of structures) {
    if (!structure.id.startsWith('ATLAS_') || structure.system !== 'muscular' || structure.variant || structure.defaultHidden) continue;
    const depth = Number(structure.layer);
    if (layer === 'all') hidden.delete(structure.id);
    else if (Number.isInteger(depth) && depth >= 1 && depth <= 10) { if (depth === Number(layer)) hidden.delete(structure.id); else hidden.add(structure.id); }
  }
  return [...hidden];
}
