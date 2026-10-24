import type { Structure } from './types';

export type CardKind = 'latin' | 'origin' | 'insertion' | 'innervation' | 'action';
export type ReviewRating = 'again' | 'good' | 'easy';
export interface RevisionCard { id: string; structureId: string; title: string; kind: CardKind; prompt: string; answer: string; source: string; }
export interface CardReview { due: number; reviewedAt: number; intervalDays: number; repetitions: number; lapses: number; }
export interface RevisionState { version: 1; deck: string[]; reviews: Record<string, CardReview>; }
export const REVISION_STORAGE_KEY = 'anatomy-studio:revision:v1';
export const DAY = 86_400_000;
export const cardLabels: Record<CardKind, string> = { latin: 'Terminology', origin: 'Origin', insertion: 'Insertion', innervation: 'Innervation', action: 'Action' };
const fields = ['origin', 'insertion', 'innervation', 'action'] as const;
const validText = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && !/^(?:n\/?a|none|unknown)[. ]*$/i.test(value.trim());

export function createRevisionCards(structures: Structure[]): RevisionCard[] {
  const cards = new Map<string, RevisionCard>();
  for (const structure of structures) {
    if (!validText(structure.name) || /unresolved|no english|laterality conflict/i.test(structure.reviewStatus || '') || /\b(?:Art|Vei|Ner|Mus|Ske|Uro|Res|Lym|End|Lig|Dig|Bra|Hea)_[A-Z]+\d+\b/.test(structure.name)) continue;
    const source = structure.source || 'Anatomy source catalogue';
    const add = (kind: CardKind, prompt: string, answer: string) => {
      const id = `${encodeURIComponent(structure.id)}::${kind}`;
      if (!cards.has(id)) cards.set(id, { id, structureId: structure.id, title: structure.name, kind, prompt, answer: answer.trim(), source });
    };
    if (validText(structure.latinName) && structure.latinName.toLowerCase() !== structure.name.toLowerCase()) add('latin', `Which structure has this source Latin label?\n${structure.latinName}`, structure.name);
    if (structure.system === 'muscular') for (const field of fields) {
      const value = structure.details?.[field];
      if (validText(value)) add(field, `Recall the ${field} of ${structure.name}.`, value);
    }
  }
  return [...cards.values()];
}

export function scheduleReview(previous: CardReview | undefined, rating: ReviewRating, now = Date.now()): CardReview {
  const prior = previous?.intervalDays || 0;
  const intervalDays = rating === 'again' ? 10 / 1440 : rating === 'good' ? Math.max(1, Math.min(180, prior * 2.5)) : Math.max(3, Math.min(365, prior * 3.5));
  return { due: now + Math.round(intervalDays * DAY), reviewedAt: now, intervalDays, repetitions: (previous?.repetitions || 0) + 1, lapses: (previous?.lapses || 0) + Number(rating === 'again') };
}

export function dueRevisionCards(cards: RevisionCard[], reviews: Record<string, CardReview>, now = Date.now()): RevisionCard[] {
  return cards.filter(card => !reviews[card.id] || reviews[card.id].due <= now).sort((a, b) => {
    const ra = reviews[a.id], rb = reviews[b.id];
    // Overdue cards first, then unseen cards in stable source order.
    if (ra && rb) return ra.due - rb.due;
    return ra ? -1 : rb ? 1 : 0;
  });
}

export function parseRevisionState(value: unknown): RevisionState {
  const empty = (): RevisionState => ({ version: 1, deck: [], reviews: {} });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty();
  const item = value as Record<string, unknown>;
  if (item.version !== 1) return empty();
  const deck = Array.isArray(item.deck) ? [...new Set(item.deck.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length < 180))].slice(0, 5000) : [];
  const reviews: Record<string, CardReview> = {};
  if (item.reviews && typeof item.reviews === 'object' && !Array.isArray(item.reviews)) {
    for (const [key, raw] of Object.entries(item.reviews).slice(0, 20000)) {
      if (!/^.{1,200}::(?:latin|origin|insertion|innervation|action)$/.test(key) || !raw || typeof raw !== 'object') continue;
      const review = raw as CardReview;
      if (![review.due, review.reviewedAt, review.intervalDays, review.repetitions, review.lapses].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) continue;
      if (review.due < review.reviewedAt || review.intervalDays > 365 || !Number.isInteger(review.repetitions) || !Number.isInteger(review.lapses) || review.lapses > review.repetitions) continue;
      reviews[key] = { due: review.due, reviewedAt: review.reviewedAt, intervalDays: review.intervalDays, repetitions: review.repetitions, lapses: review.lapses };
    }
  }
  return { version: 1, deck, reviews };
}

export function readRevisionState(storage?: Pick<Storage, 'getItem'>): RevisionState {
  try { return parseRevisionState(JSON.parse(storage?.getItem(REVISION_STORAGE_KEY) || 'null')); } catch { return parseRevisionState(null); }
}

/** Link only full normalized catalogue names or synonyms, never inferred anatomy. */
export function exactRelatedStructures(text: string, structures: Structure[]): Structure[] {
  const normal = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const terms = new Set([text, ...text.split(/[;,\n]/)].map(normal).filter(Boolean));
  return structures.filter(structure => structure.system === 'nervous' && [structure.name, ...(structure.synonyms || [])].some(name => terms.has(normal(name))));
}

/** Match the actual schedule, including fractional-day intervals after repeated reviews. */
export function reviewDelay(intervalDays:number):string{
 const minutes=Math.max(1,Math.round(intervalDays*1440));
 if(minutes<60)return `${minutes} ${minutes===1?'minute':'minutes'}`;
 const days=minutes/1440;
 if(days>=1)return `${Number(days.toFixed(1))} ${days===1?'day':'days'}`;
 const hours=Number((minutes/60).toFixed(1));return `${hours} ${hours===1?'hour':'hours'}`;
}
