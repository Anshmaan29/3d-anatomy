import { useEffect, useMemo, useState } from 'react';
import type { Structure, SystemId } from './types';
import { systemNames } from './study';
import { cardLabels, createRevisionCards, dueRevisionCards, exactRelatedStructures, readRevisionState, reviewDelay, scheduleReview, REVISION_STORAGE_KEY } from './revision';
import type { CardKind, ReviewRating, RevisionCard } from './revision';
import './study-tools.css';

interface Props { structures: Structure[]; onExplore: (id: string) => void; selectedIds?: string[]; }
const kinds: CardKind[] = ['latin', 'origin', 'insertion', 'innervation', 'action'];
const detailFields = ['origin', 'insertion', 'innervation', 'action'] as const;

export default function StudyTools({ structures, onExplore, selectedIds = [] }: Props) {
  const [saved, setSaved] = useState(() => {
    try { return readRevisionState(typeof window === 'undefined' ? undefined : window.localStorage); }
    catch { return readRevisionState(); }
  });
  const [scope, setScope] = useState<'all' | 'saved'>('all');
  const [system, setSystem] = useState('all');
  const [kind, setKind] = useState('all');
  const [session, setSession] = useState<RevisionCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewMessage,setReviewMessage]=useState('');
  const [storageError, setStorageError] = useState(false);
  const [now, setNow] = useState(Date.now);
  const allCards = useMemo(() => createRevisionCards(structures), [structures]);
  const allCardIds = useMemo(() => new Set(allCards.map(card => card.id)), [allCards]);
  const byId = useMemo(() => new Map(structures.map(s => [s.id, s])), [structures]);
  const availableDeck = saved.deck.filter(id => byId.has(id));
  const filtered = useMemo(() => allCards.filter(card => (scope === 'all' || saved.deck.includes(card.structureId)) && (system === 'all' || byId.get(card.structureId)?.system === system) && (kind === 'all' || card.kind === kind)), [allCards, scope, saved.deck, system, kind, byId]);
  const due = useMemo(() => dueRevisionCards(filtered, saved.reviews, now), [filtered, saved.reviews, now]);
  const current = session[index];
  const selected = selectedIds.map(id => byId.get(id)).filter((s): s is Structure => Boolean(s));
  const muscles = selected.filter(s => s.system === 'muscular' && detailFields.some(field => Boolean(s.details?.[field]?.trim()) && !/^n\/?a$/i.test(s.details?.[field] || ''))).slice(0, 4);
  const eligibleIds = new Set(allCards.map(card => card.structureId));
  const addable = selected.filter(s => eligibleIds.has(s.id) && !saved.deck.includes(s.id));
  const systems = [...new Set(structures.map(s => s.system))];

  useEffect(() => {
    try { localStorage.setItem(REVISION_STORAGE_KEY, JSON.stringify(saved)); setStorageError(false); } catch { setStorageError(true); }
  }, [saved]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const start = () => {setReviewMessage(''); setSession(due.slice(0, 20)); setIndex(0); setRevealed(false); setMessage(''); };
  const rate = (rating: ReviewRating) => {
    if (!current || !revealed) return;
    const time = Date.now();
    const scheduled=scheduleReview(saved.reviews[current.id],rating,time);setReviewMessage(`${current.title} · next review in ${reviewDelay(scheduled.intervalDays)}.`);
    setSaved(state => ({ ...state, reviews: { ...state.reviews, [current.id]: scheduleReview(state.reviews[current.id], rating, time) } }));
    setNow(time); setIndex(value => value + 1); setRevealed(false);
  };
  const end = () => { setSession([]); setIndex(0); setRevealed(false); };
  const cardSource = current ? byId.get(current.structureId) : undefined;
  const nextDue = filtered.map(card => saved.reviews[card.id]?.due).filter((time): time is number => typeof time === 'number' && time > now).sort((a, b) => a - b)[0];

  return <section className="revision-workspace" aria-labelledby="revision-title">
    <header className="revision-heading"><div><span className="revision-eyebrow">LEARN · RECALL · REVISIT</span><h1 id="revision-title">Make anatomy stick.</h1><p>Short, source-based revision sessions. Recall first, then check the answer.</p></div><span className="revision-local">Progress stays on this device</span></header>
    <div className="revision-stats" aria-label="Revision overview"><div><strong>{due.length}</strong><span>cards ready</span></div><div><strong>{availableDeck.length}</strong><span>structures in your deck</span></div><div><strong>{Object.keys(saved.reviews).filter(id => allCardIds.has(id)).length}</strong><span>cards reviewed</span></div></div>
    <div className="revision-layout"><main className="revision-main">
      <div className="revision-filters"><label>Deck<select value={scope} onChange={event => { setScope(event.target.value as 'all' | 'saved'); end(); }}><option value="all">Source catalogue</option><option value="saved">My saved deck</option></select></label><label>System<select value={system} onChange={event => { setSystem(event.target.value); end(); }}><option value="all">All systems</option>{systems.map(value => <option key={value} value={value}>{systemNames[value as SystemId]}</option>)}</select></label><label>Question<select value={kind} onChange={event => { setKind(event.target.value); end(); }}><option value="all">All questions</option>{kinds.map(value => <option key={value} value={value}>{cardLabels[value]}</option>)}</select></label></div>
      <div className="revision-card" aria-label="Recall card">
        {current ? <>
          <div className="revision-card-top"><span>{cardLabels[current.kind]}</span><span>{index + 1} / {session.length}</span></div><progress value={index} max={session.length} aria-label={`${index} of ${session.length} cards reviewed`} />
          <div className="revision-prompt" key={current.id}><span className="revision-eyebrow">RECALL BEFORE REVEALING</span><h2>{current.prompt}</h2>{!revealed && <p>Say your answer aloud, or write it down.</p>}</div>
          {revealed ? <div className="revision-answer" aria-live="polite"><span>Source answer</span><p>{current.answer}</p><small>{current.source} · {cardSource?.reviewStatus || 'Source-derived; independent review pending'}</small></div> : <button className="revision-primary revision-reveal" onClick={() => setRevealed(true)}>Reveal answer</button>}
          {revealed && <div className="revision-rating-wrap"><p className="revision-rating-explanation">How well did you remember? Your choice sets when this card is due again in Revision.</p><div className="revision-rating" aria-label="Schedule your next review">{([{rating:'again',label:'Again'},{rating:'good',label:'Good'},{rating:'easy',label:'Easy'}] as const).map(({rating,label})=><button key={rating} onClick={()=>rate(rating)}><strong>{label}</strong><small>Review in {reviewDelay(scheduleReview(saved.reviews[current.id],rating,now).intervalDays)}</small></button>)}</div></div>}
          <div className="revision-card-footer"><button onClick={() => onExplore(current.structureId)}>Explore in 3D ↗</button><button onClick={end}>End session</button></div>
        </> : <div className="revision-start"><span className="revision-eyebrow">{session.length ? 'SESSION COMPLETE' : 'A LITTLE EVERY DAY'}</span><h2>{session.length ? `${session.length} answers revisited.` : due.length ? 'Ready for a recall round?' : 'You’re up to date.'}</h2><p>{due.length ? `Start with ${Math.min(20, due.length)} cards from ${filtered.length} available questions. Nothing is timed.` : filtered.length ? `Your next review is ${nextDue ? new Date(nextDue).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' }) : 'not scheduled'}.` : scope === 'saved' ? 'Select structures in the atlas and add them to your deck. Only structures with source questions appear here.' : 'This filter has no source questions. Try another system or question type.'}</p>{due.length > 0 && <button className="revision-primary" onClick={start}>{session.length ? 'Start another round' : 'Start revision'}</button>}</div>}
      </div>
      <p className="revision-review-status" role="status">{reviewMessage}</p>
      <p className="revision-review-notice">Answers reproduce the source catalogue, including its limitations. Clinical review is pending. Use your prescribed anatomy text to verify exam answers. The review intervals are a simple local schedule.</p>
      <section className="revision-comparison" aria-labelledby="comparison-title"><div className="revision-section-title"><h2 id="comparison-title">Compare muscles</h2><span>{muscles.length} / 4 selected</span></div><p>Select two to four muscles in the atlas to compare their source descriptions side by side.</p>{muscles.length >= 2 ? <div className="revision-table-scroll" tabIndex={0} role="region" aria-label="Muscle comparison table; scroll horizontally"><table><caption className="revision-sr-only">Source-derived muscle origin, insertion, innervation and action</caption><thead><tr><th scope="col">Detail</th>{muscles.map(muscle => <th scope="col" key={muscle.id}><button onClick={() => onExplore(muscle.id)}>{muscle.name} ↗</button></th>)}</tr></thead><tbody>{detailFields.map(field => <tr key={field}><th scope="row">{cardLabels[field]}</th>{muscles.map(muscle => { const value = muscle.details?.[field]; const usable = value?.trim() && !/^n\/?a$/i.test(value); return <td key={muscle.id}>{usable ? value : <span className="revision-missing">Not supplied by source</span>}{field === 'innervation' && usable && exactRelatedStructures(value!, structures).slice(0, 3).map(nerve => <button className="revision-related" key={nerve.id} onClick={() => onExplore(nerve.id)}>Explore {nerve.name} ↗</button>)}</td>; })}</tr>)}</tbody></table></div> : <div className="revision-comparison-empty">{muscles.length === 1 ? `${muscles[0].name} is selected. Add one more muscle with source details.` : 'Your selected muscle comparison will appear here.'}</div>}{selected.length > 4 && <small>The first four selected muscles with source descriptions are shown.</small>}</section>
    </main><aside className="revision-deck" aria-labelledby="revision-deck-title"><h2 id="revision-deck-title">Your study deck</h2><p>Build a focused deck from the structures you select in the atlas.</p><button className="revision-primary" disabled={!addable.length} onClick={() => { setSaved(state => ({ ...state, deck: [...new Set([...state.deck, ...addable.map(s => s.id)])].slice(0, 5000) })); setMessage(`${addable.length} selected structure${addable.length === 1 ? '' : 's'} added.`); }}>Add {addable.length || ''} selected {addable.length === 1 ? 'structure' : 'structures'}</button>{!selected.length && <small>Use the atlas selection controls, then return to Revision.</small>}{selected.length > 0 && !addable.length && <small>The selected structures are already saved or have no source revision questions.</small>}<span className="revision-feedback" role="status">{message}</span><ul>{availableDeck.slice(0, 40).map(id => <li key={id}><button className="revision-deck-name" onClick={() => onExplore(id)}>{byId.get(id)?.name}</button><button className="revision-remove" aria-label={`Remove ${byId.get(id)?.name} from study deck`} onClick={() => setSaved(state => ({ ...state, deck: state.deck.filter(value => value !== id) }))}>×</button></li>)}</ul>{availableDeck.length > 40 && <small>Showing the first 40 of {availableDeck.length} saved structures. All are included in revision.</small>}{!availableDeck.length && <div className="revision-empty-deck">No structures saved yet.<br />You can still revise the source catalogue.</div>}<p className="revision-storage-note">{storageError ? 'Browser storage is unavailable. This session still works, but progress may be lost after closing.' : 'Saved in this browser. No account or personal data is needed. Clearing site data removes this progress.'}</p></aside></div>
  </section>;
}
