import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Bone, Bookmark, BookOpen, Brain, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Circle, CircleDot, Copy, Droplets, Expand, Eye, EyeOff, Focus, Heart, Layers3, LoaderCircle, Maximize, Menu, Minus, MousePointer2, Move, Plus, RotateCcw, Scissors, Search, Settings2, Share2, Sparkles, Trash2, Wind, X } from 'lucide-react';
import Viewer from './Viewer';
import AnnotationPanel from './AnnotationPanel';
import type { Annotation, AnnotationAnchor, AnatomyData, CameraState, Structure, SystemId, ViewerHandle } from './types';
import { getStudyNote, systemDescriptions, systemNames } from './study';

const SYSTEMS = Object.keys(systemNames) as SystemId[];
const systemIcons: Record<SystemId, ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = { skeletal: Bone, muscular: Activity, cardiovascular: Heart, nervous: Brain, respiratory: Wind, digestive: CircleDot, urinary: Droplets, reproductive: Circle, lymphatic: Layers3, endocrine: Droplets };
type Tab = 'atlas' | 'practice' | 'saved';
type Direction = 'anterior' | 'posterior' | 'left' | 'right' | 'superior';
type Orientation = Direction | 'custom';
type Scene = { id: string; name: string; created: string; systems: SystemId[]; selectedId: string | null; hiddenIds: string[]; isolatedId: string | null; opacity: number; exploded: boolean; labels: boolean; section: boolean; direction: Orientation; camera?: CameraState };
type Quiz = { target: Structure; options: Structure[]; answer: string | null };
const STORAGE = 'anatomy-studio-v1';

function readLocal<T,>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(`${STORAGE}:${key}`); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}
function writeLocal(key: string, value: unknown) { try { localStorage.setItem(`${STORAGE}:${key}`, JSON.stringify(value)); } catch { /* Viewer stays usable if storage is unavailable. */ } }
function initialLink() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const systems = (params.get('systems') || '').split(',').filter((v): v is SystemId => SYSTEMS.includes(v as SystemId));
  return { systems: systems.length ? systems : ['skeletal'] as SystemId[], selected: params.get('structure') };
}
function pretty(value: string) { return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
function shuffle<T,>(items: T[]): T[] { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }
function safeScenes(value: unknown): Scene[] { return Array.isArray(value) ? value.filter((scene) => scene && typeof scene.id === 'string' && typeof scene.name === 'string' && Array.isArray(scene.systems) && Array.isArray(scene.hiddenIds)).slice(0, 50) : []; }

function Emblem({ small = false }: { small?: boolean }) { return <span className={`emblem ${small ? 'emblem-small' : ''}`} aria-hidden="true"><i /><i /><i /><i /></span>; }

export default function App() {
  const [data, setData] = useState<AnatomyData | null>(null);
  const [dataError, setDataError] = useState('');
  const [dataAttempt, setDataAttempt] = useState(0);
  const [activeSystems, setActiveSystems] = useState<SystemId[]>(() => initialLink().systems);
  const [selectedId, setSelectedId] = useState<string | null>(() => initialLink().selected);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(1);
  const [exploded, setExploded] = useState(false);
  const [labels, setLabels] = useState(false);
  const [section, setSection] = useState(false);
  const [quality, setQuality] = useState<'high' | 'balanced'>(() => readLocal<string>('quality', 'balanced') === 'high' ? 'high' : 'balanced');
  const [annotations,setAnnotations] = useState<Annotation[]>(()=>{const value=readLocal<unknown>('annotations',[]);return Array.isArray(value)?value.filter(a=>a&&typeof a.id==='string'&&typeof a.structureId==='string'&&typeof a.text==='string'&&a.text.length<=180&&Array.isArray(a.point)&&a.point.length===3&&a.point.every(Number.isFinite)).slice(0,50):[];});
  const [placingAnnotation,setPlacingAnnotation]=useState(false);
  const [pendingAnchor,setPendingAnchor]=useState<AnnotationAnchor|null>(null);
  const [tab, setTab] = useState<Tab>('atlas');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [modal, setModal] = useState<'help' | 'settings' | 'sources' | 'save' | null>(null);
  const [favourites, setFavourites] = useState<string[]>(() => { const value = readLocal<unknown>('favourites', []); return Array.isArray(value) ? value.filter(v => typeof v === 'string') : []; });
  const [scenes, setScenes] = useState<Scene[]>(() => safeScenes(readLocal('scenes', [])));
  const [sceneName, setSceneName] = useState('');
  const [direction, setDirection] = useState<Orientation>('anterior');
  const [viewerLoading, setViewerLoading] = useState(true);
  const [viewerError, setViewerError] = useState('');
  const [viewerAttempt, setViewerAttempt] = useState(0);
  const [metrics, setMetrics] = useState<{ meshes: number; triangles: number } | null>(null);
  const [toast, setToast] = useState('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizScore, setQuizScore] = useState({ correct: 0, total: 0 });
  const viewer = useRef<ViewerHandle>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const sceneNameInput = useRef<HTMLInputElement>(null);
  const previousTab = useRef<Tab>('atlas');

  useEffect(() => {
    const controller = new AbortController();
    setDataError('');
    Promise.all(['/data/anatomy.json','/data/supplement.json'].map(path=>fetch(path,{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error(`An anatomy catalogue could not be loaded (${response.status}).`);return response.json();}))).then(([value,supplement])=>{if(!Array.isArray(value.structures)||!value.structures.length)throw new Error('The anatomy catalogue is empty.');setData({...value,structures:[...value.structures,...supplement.structures]});}).catch((error:Error)=>{if(error.name!=='AbortError')setDataError(error.message);});
    return () => controller.abort();
  }, [dataAttempt]);
  useEffect(()=>{writeLocal('annotations',annotations);},[annotations]);
  useEffect(()=>{if(tab!=='atlas'){setPlacingAnnotation(false);setPendingAnchor(null);}},[tab]);
  useEffect(() => { writeLocal('favourites', favourites); }, [favourites]);
  useEffect(() => { writeLocal('scenes', scenes); }, [scenes]);
  useEffect(() => { writeLocal('quality', quality); }, [quality]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3400); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (modal === 'save') setTimeout(() => sceneNameInput.current?.focus(), 50); }, [modal]);
  useEffect(() => {
    if (!data || tab === 'practice') return;
    const params = new URLSearchParams();
    params.set('systems', activeSystems.join(','));
    if (selectedId) params.set('structure', selectedId);
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${params}`);
  }, [activeSystems, selectedId, data, tab]);
  useEffect(() => {
    const onHash = () => { const link = initialLink(); setActiveSystems(link.systems); setSelectedId(link.selected); setIsolatedId(null); setHiddenIds([]); setTab('atlas'); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const structures = data?.structures ?? [];
  const structureMap = useMemo(() => new Map(structures.map(s => [s.id, s])), [structures]);
  const selected = selectedId ? structureMap.get(selectedId) : undefined;
  const systemCounts = useMemo(() => Object.fromEntries(SYSTEMS.map(s => [s, structures.filter(item => item.system === s).length])) as Record<SystemId, number>, [structures]);
  const currentStructures = useMemo(() => structures.filter(item => activeSystems.includes(item.system)), [structures, activeSystems]);
  const regions = useMemo(() => [...new Set(currentStructures.map(s => s.region).filter(Boolean))].sort(), [currentStructures]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (normalized ? structures : currentStructures).filter(item => (region === 'all' || item.region === region) && (!normalized || [item.name, item.id, item.sourceId, item.region, ...(item.synonyms ?? [])].filter(Boolean).join(' ').toLowerCase().includes(normalized)));
  }, [structures, currentStructures, query, region]);
  const groups = useMemo(() => {
    const result: Record<string, Structure[]> = {};
    for (const item of filtered) { const key = item.region || 'Other structures'; (result[key] ??= []).push(item); }
    return Object.entries(result).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const note = selected ? getStudyNote(selected) : undefined;
  const favouriteStructures = favourites.map(id => structureMap.get(id)).filter((s): s is Structure => !!s);
  const systemTitle = activeSystems.length === 1 ? `${systemNames[activeSystems[0]]} system` : `${activeSystems.length} anatomy systems`;

  const chooseStructure = useCallback((id: string) => {
    const structure = structureMap.get(id); if (!structure) return;
    if (!activeSystems.includes(structure.system)) setActiveSystems(systems => [...systems, structure.system]);
    setSelectedId(id); setHiddenIds(ids => ids.filter(v => v !== id));
    if (isolatedId && isolatedId !== id) setIsolatedId(null);
    setDetailsOpen(true);
    viewer.current?.focus(id);
    if (tab === 'saved') setTab('atlas');
  }, [structureMap, activeSystems, isolatedId, tab]);
  const toggleFavourite = (id: string) => setFavourites(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]);
  const toggleHidden = useCallback((id: string) => { setHiddenIds(ids => ids.includes(id) ? ids.filter(v => v !== id) : [...ids, id]); }, []);
  const resetScene = useCallback(() => { setHiddenIds([]); setIsolatedId(null); setOpacity(1); setExploded(false); setSection(false); setDirection('anterior'); viewer.current?.home(); }, []);
  const changeDirection = (value: Direction) => { setDirection(value); viewer.current?.view(value); };
  const toggleSystem = (id: SystemId, additive: boolean) => {
    if (!additive) { setActiveSystems([id]); setIsolatedId(null); if (selected?.system !== id) setSelectedId(null); }
    else if (activeSystems.includes(id) && activeSystems.length > 1) { setActiveSystems(systems => systems.filter(v => v !== id)); if (selected?.system === id) setSelectedId(null); if (isolatedId && structureMap.get(isolatedId)?.system === id) setIsolatedId(null); } else setActiveSystems(systems => systems.includes(id) ? systems : [...systems, id]);
    setRegion('all'); setViewerError(''); setQuiz(null);
  };
  const newQuestion = useCallback(() => {
    const pool = currentStructures.filter(s => !hiddenIds.includes(s.id));
    if (pool.length < 4) { setQuiz(null); return; }
    const candidates = pool.filter(s => s.id !== quiz?.target.id);
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const distractors = shuffle(pool.filter(s => s.id !== target.id && s.name !== target.name)).slice(0, 3);
    if (distractors.length < 3) { setQuiz(null); return; }
    setQuiz({ target, options: shuffle([target, ...distractors]), answer: null });
    setIsolatedId(null); setLabels(false); setSection(false); setExploded(false); setOpacity(1);
    setTimeout(() => viewer.current?.focus(target.id), 60);
  }, [currentStructures, hiddenIds, quiz?.target.id]);
  useEffect(() => {
    if (tab === 'practice' && !quiz && currentStructures.length >= 4 && !viewerLoading) newQuestion();
    previousTab.current = tab;
  }, [tab, quiz, currentStructures, viewerLoading, newQuestion]);
  const answerQuestion = (id: string) => {
    if (!quiz || quiz.answer) return;
    setQuiz({ ...quiz, answer: id }); setQuizScore(score => ({ correct: score.correct + Number(id === quiz.target.id), total: score.total + 1 }));
  };
  const openTab = (value: Tab) => { setTab(value); setDetailsOpen(value !== 'atlas'); if (value !== 'practice' && previousTab.current === 'practice') setQuiz(null); };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches('input, textarea, select') || target.isContentEditable) { if (event.key === 'Escape') { searchInput.current?.blur(); setModal(null); } return; }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '/') { event.preventDefault(); setSidebarOpen(true); searchInput.current?.focus(); }
      if (event.key === 'Escape') { setModal(null); setSidebarOpen(false); setIsolatedId(null); }
      if (event.key.toLowerCase() === 'r') resetScene();
      if (event.key.toLowerCase() === 'f') viewer.current?.focus(tab === 'practice' ? quiz?.target.id : selectedId ?? undefined);
      if (event.key.toLowerCase() === 'h' && selectedId && tab !== 'practice') toggleHidden(selectedId);
      if (event.key.toLowerCase() === 'i' && selectedId && tab !== 'practice') setIsolatedId(current => current === selectedId ? null : selectedId);
      if (event.key === '?' || (event.key === '/' && event.shiftKey)) setModal('help');
      if (event.key === '+' || event.key === '=') viewer.current?.zoom(-1);
      if (event.key === '-') viewer.current?.zoom(1);
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [resetScene, selectedId, toggleHidden, tab, quiz]);
  useEffect(() => {
    if (!modal) return;
    const container = document.querySelector<HTMLElement>('.modal');
    const previous = document.activeElement as HTMLElement | null;
    container?.focus();
    const trap = (event: KeyboardEvent) => { if (event.key !== 'Tab' || !container) return; const elements = [...container.querySelectorAll<HTMLElement>('button,a,input,select,[tabindex="0"]')].filter(item => !item.hasAttribute('disabled')); const first = elements[0], last = elements[elements.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } };
    document.addEventListener('keydown', trap); return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [modal]);

  const saveScene = () => {
    const name = sceneName.trim(); if (!name) return;
    const scene: Scene = { id: crypto.randomUUID(), name, created: new Date().toISOString(), systems: [...activeSystems], selectedId, hiddenIds: [...hiddenIds], isolatedId, opacity, exploded, labels, section, direction, camera: viewer.current?.getCamera() };
    setScenes(items => [scene, ...items].slice(0, 50)); setModal(null); setSceneName(''); setToast('View saved on this device.');
  };
  const restoreScene = (scene: Scene) => { setActiveSystems(scene.systems.filter(s => SYSTEMS.includes(s))); setSelectedId(scene.selectedId); setHiddenIds(scene.hiddenIds); setIsolatedId(scene.isolatedId); setOpacity(scene.opacity); setExploded(scene.exploded); setLabels(scene.labels); setSection(scene.section); setDirection(scene.direction); setTab('atlas'); setTimeout(() => { if (scene.camera) viewer.current?.restoreCamera(scene.camera); else viewer.current?.view(scene.direction === 'custom' ? 'anterior' : scene.direction); }, 150); setToast(`Opened “${scene.name}”.`); };
  const copyLink = async () => { try { await navigator.clipboard.writeText(window.location.href); setToast('Link copied. It includes your systems and selected structure.'); } catch { setToast('Copy the address in your browser to share this structure.'); } };
  const exportBookmarks = () => { const blob = new Blob([JSON.stringify({ application: 'Anatomy Studio', exported: new Date().toISOString(), annotations, favourites: favouriteStructures.map(({ id, name, system, sourceId }) => ({ id, name, system, sourceId })), scenes }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'anatomy-studio-study.json'; anchor.click(); URL.revokeObjectURL(url); setToast('Study collection exported.'); };
  const handleReady = useCallback((value: { meshes: number; triangles: number }) => { setMetrics(value); setViewerError(''); }, []);
  const handleLoading = useCallback((value: boolean) => setViewerLoading(value), []);
  const handleError = useCallback((value: string) => { setViewerError(value); setViewerLoading(false); }, []);

  const annotationPanel=<AnnotationPanel annotations={annotations.filter(note=>activeSystems.includes(structureMap.get(note.structureId)?.system as SystemId))} placing={placingAnnotation} onPlacingChange={value=>{setPlacingAnnotation(value);setPendingAnchor(null);}} pendingAnchor={pendingAnchor} onCancelAnchor={()=>{setPendingAnchor(null);setPlacingAnnotation(false);}} onSave={text=>{if(!pendingAnchor||!text.trim())return;setAnnotations(items=>[...items,{...pendingAnchor,id:crypto.randomUUID(),text:text.trim().slice(0,180),created:new Date().toISOString()}].slice(-50));setPendingAnchor(null);setPlacingAnnotation(false);setToast('3D annotation saved. Its pin follows the anatomy.');}} onDelete={id=>setAnnotations(items=>items.filter(note=>note.id!==id))} onFocus={note=>{chooseStructure(note.structureId);setLabels(true);}}/>;
  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="#" onClick={(event) => { event.preventDefault(); openTab('atlas'); }} aria-label="Anatomy Studio home"><Emblem /><span>Anatomy<span className="brand-light">Studio</span><small>THE OPEN ANATOMY WORKSPACE</small></span></a>
      <nav className="main-tabs" aria-label="Workspace">
        <button className={tab === 'atlas' ? 'active' : ''} onClick={() => openTab('atlas')}><Layers3 size={15} /> Atlas</button>
        <button className={tab === 'practice' ? 'active' : ''} onClick={() => openTab('practice')}><BookOpen size={15} /> Practice</button>
        <button className={tab === 'saved' ? 'active' : ''} onClick={() => openTab('saved')}><Bookmark size={15} /> Saved<span className="tab-count">{favourites.length + scenes.length || ''}</span></button>
      </nav>
      <div className="header-actions"><span className="free-label"><i /> Free to explore</span><button className="icon-button" title="Keyboard shortcuts and help" aria-label="Help" onClick={() => setModal('help')}><CircleHelp size={19} /></button><button className="icon-button" title="Viewer settings" aria-label="Settings" onClick={() => setModal('settings')}><Settings2 size={19} /></button><span className="avatar" aria-label="Local study workspace">AS</span></div>
    </header>

    <div className="workspace">
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close anatomy browser" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`} aria-label="Anatomy browser">
        <div className="sidebar-top"><div className="sidebar-heading"><span>ANATOMY LIBRARY</span><button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close anatomy browser"><X size={18} /></button></div><div className="search-box"><Search size={16} /><input ref={searchInput} value={query} onChange={event => { setQuery(event.target.value); setRegion('all'); }} placeholder="Search anatomy" aria-label="Search anatomical structures" /><span className="search-key">/</span>{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={13} /></button>}</div></div>
        <div className="system-heading"><span>Body systems</span><span className="small-muted">{activeSystems.length} active</span></div>
        <div className="systems-list">
          {SYSTEMS.map(id => { const Icon = systemIcons[id]; const active = activeSystems.includes(id); const unavailable = !!data && !systemCounts[id]; return <div key={id} className={`system-row ${active ? 'system-active' : ''} ${unavailable ? 'system-unavailable' : ''}`}><button className="system-select" title={unavailable ? `${systemNames[id]} models are not in this dataset` : `${systemDescriptions[id]}. Click to view this system.`} onClick={() => toggleSystem(id, false)} disabled={unavailable}><span className={`system-icon system-${id}`}><Icon size={17} strokeWidth={1.7} /></span><span>{systemNames[id]}</span>{active && <span className="system-active-dot" />}</button><button className={`layer-toggle ${active ? 'layer-on' : ''}`} disabled={unavailable || (active && activeSystems.length === 1)} title={active ? 'Remove this layer' : 'Add this layer'} aria-label={`${active ? 'Remove' : 'Add'} ${systemNames[id]} layer`} aria-pressed={active} onClick={() => toggleSystem(id, true)}>{active ? <Eye size={14} /> : <Plus size={14} />}</button></div>; })}
        </div>
        <div className="sidebar-divider" />
        {tab !== 'practice' ? <><div className="structure-heading"><span>{query ? 'Search results' : 'Structures'}<b>{filtered.length}</b></span><button className="text-button" onClick={() => { setHiddenIds([]); setIsolatedId(null); }} disabled={!hiddenIds.length && !isolatedId}>Show all</button></div><div className="region-filter"><select value={region} onChange={event => setRegion(event.target.value)} aria-label="Filter structures by region"><option value="all">All body regions</option>{regions.map(value => <option key={value} value={value}>{pretty(value)}</option>)}</select><ChevronDown size={13} /></div><div className="structure-list">
          {!data && !dataError && <div className="catalogue-loading"><LoaderCircle size={17} className="spin" /> Loading catalogue…</div>}
          {groups.map(([name, items]) => <div className="structure-group" key={name}><button className="group-heading" aria-expanded={!collapsedGroups.includes(name)} onClick={() => setCollapsedGroups(groups => groups.includes(name) ? groups.filter(v => v !== name) : [...groups, name])}>{collapsedGroups.includes(name) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}<span>{pretty(name)}</span><small>{items.length}</small></button>{!collapsedGroups.includes(name) && items.map(item => <div className={`structure-row ${item.id === selectedId ? 'structure-selected' : ''} ${hiddenIds.includes(item.id) ? 'structure-hidden' : ''}`} key={item.id}><button className="structure-name" onClick={() => chooseStructure(item.id)} title={item.name}><span className="structure-node" /><span>{item.name}</span>{favourites.includes(item.id) && <Bookmark size={10} fill="currentColor" />}</button><button className="structure-eye" onClick={() => toggleHidden(item.id)} title={hiddenIds.includes(item.id) ? `Show ${item.name}` : `Hide ${item.name}`} aria-label={hiddenIds.includes(item.id) ? `Show ${item.name}` : `Hide ${item.name}`}>{hiddenIds.includes(item.id) ? <EyeOff size={12} /> : <Eye size={12} />}</button></div>)}</div>)}
          {data && !filtered.length && <div className="sidebar-empty"><Search size={23} /><strong>No structures found</strong><p>Try a structure name, source ID or another region.</p><button onClick={() => { setQuery(''); setRegion('all'); }}>Clear filters</button></div>}
        </div></> : <div className="practice-sidebar"><span className="mini-eyebrow">ACTIVE RECALL</span><h3>Look closely.<br />Make the connection.</h3><p>Identify the highlighted structure from four choices. Rotate and zoom to inspect it from any angle.</p><div className="practice-sidebar-stat"><span>{quizScore.correct}<small>correct</small></span><span>{quizScore.total}<small>answered</small></span></div><div className="practice-tip"><MousePointer2 size={17} /><p>Labels and the structure list are hidden during practice.</p></div><button className="sidebar-secondary" onClick={() => { setQuizScore({ correct: 0, total: 0 }); setQuiz(null); }}>Restart session <RotateCcw size={14} /></button></div>}
        <button className="sidebar-footer" onClick={() => setModal('sources')}><span className="source-mark"><Layers3 size={14} /></span><span>Open anatomy. Real structures.<small>Dataset & attribution</small></span><ArrowUpRight size={14} /></button>
      </aside>

      <main className="atlas-stage" aria-label="Interactive anatomy viewer">
        <div className="stage-heading"><div><div className="stage-eyebrow"><span className="status-dot" /> INTERACTIVE 3D ATLAS</div><div className="stage-title-row"><button className="icon-button library-menu" onClick={() => setSidebarOpen(true)} aria-label="Open anatomy browser"><Menu size={19} /></button><h1>{tab === 'practice' ? 'Anatomy, from memory.' : systemTitle}</h1><span className="edition-tag">HUMAN</span></div><p>{tab === 'practice' ? 'Turn observation into understanding.' : 'Explore the body. Understand the connections.'}</p></div><div className="stage-top-actions">{tab !== 'practice' && <button className="stage-action" title="Save this view on your device" onClick={() => { setSceneName(selected?.name || systemTitle); setModal('save'); }}><Bookmark size={15} /><span>Save view</span></button>}<button className="icon-button" onClick={copyLink} title="Copy link to this anatomy view" aria-label="Share this view"><Share2 size={17} /></button></div></div>

        <div className="viewer-container">
          <div className="anatomy-grid" aria-hidden="true" />
          {data && <Viewer key={viewerAttempt} ref={viewer} annotations={tab==='atlas'?annotations:[]} placingAnnotation={placingAnnotation} onAnnotationAnchor={anchor=>{setPendingAnchor(anchor);setPlacingAnnotation(false);setDetailsOpen(true);}} structures={structures} activeSystems={activeSystems} selectedId={tab === 'practice' ? quiz?.target.id ?? null : selectedId} hiddenIds={hiddenIds} isolatedId={isolatedId} opacity={opacity} exploded={exploded} labels={tab === 'practice' ? false : labels} quality={quality} section={section} onSelect={id => { if (tab !== 'practice') { if (id) chooseStructure(id); else setSelectedId(null); } }} onOrientationChange={setDirection} onReady={handleReady} onLoading={handleLoading} onError={handleError} />}
          <div className="view-context"><span className="context-line" /><span>{direction === 'custom' ? 'Free orbit' : `${pretty(direction)} view`}</span><small>{isolatedId ? 'Isolated structure' : section ? 'Section view' : 'Whole body'}</small></div>
          <div className="orientation-marker" aria-label="Orientation reference"><span className="orientation-top">S</span><span className="orientation-left">R</span><div className="orientation-cross"><span /><span /></div><span className="orientation-right">L</span><span className="orientation-bottom">I</span></div>
          {!viewerLoading && !viewerError && data && <div className="view-status"><span className="status-dot" />{metrics ? `${metrics.meshes.toLocaleString()} structures in view` : 'Ready to explore'}</div>}
          {(viewerLoading || !data) && !viewerError && !dataError && <div className="loading-state"><div className="loading-orbit"><Emblem small /></div><strong>Preparing your anatomy workspace</strong><p>{!data ? 'Loading the structure catalogue…' : `Loading ${activeSystems.map(s => systemNames[s].toLowerCase()).join(' + ')} anatomy…`}</p><div className="loading-bar"><span /></div><small>Detailed models are downloaded once, then cached.</small></div>}
          {(viewerError || dataError) && <div className="error-state"><Layers3 size={28} /><h2>Let’s get your atlas back.</h2><p>{viewerError || dataError}</p><button className="primary-button" onClick={() => { setViewerError(''); setViewerLoading(true); if (dataError) setDataAttempt(value => value + 1); else setViewerAttempt(value => value + 1); }}><RotateCcw size={15} /> Retry loading</button></div>}
          {isolatedId && <button className="exit-isolate" onClick={() => setIsolatedId(null)}><X size={13} /> Exit isolation</button>}
          {tab === 'practice' && quiz && <div className="practice-indicator"><span className="pulsing-dot" />{quiz.answer ? 'Answer revealed' : 'Identify the highlighted structure'}</div>}
        </div>

        <div className="stage-bottom"><div className="orientation-presets" aria-label="Camera presets">{(['anterior', 'posterior', 'left', 'right'] as Direction[]).map(value => <button key={value} className={direction === value ? 'active' : ''} onClick={() => changeDirection(value)}>{pretty(value)}</button>)}</div><div className="viewer-toolbar" role="toolbar" aria-label="3D viewer controls"><button onClick={() => viewer.current?.home()} title="Reset view (R)" aria-label="Reset view"><RotateCcw size={18} /></button><span className="toolbar-separator" /><button onClick={() => viewer.current?.zoom(-1)} title="Zoom in (+)" aria-label="Zoom in"><Plus size={19} /></button><button onClick={() => viewer.current?.zoom(1)} title="Zoom out (-)" aria-label="Zoom out"><Minus size={19} /></button><button onClick={() => viewer.current?.focus(tab === 'practice' ? quiz?.target.id : selectedId ?? undefined)} title="Focus selection (F)" aria-label="Focus selection"><Focus size={19} /></button><span className="toolbar-separator" /><button className={labels ? 'active' : ''} disabled={tab === 'practice'} onClick={() => setLabels(value => !value)} title={tab === 'practice' ? 'Labels are hidden in practice' : 'Toggle selected structure label'} aria-label="Toggle labels" aria-pressed={labels}><span className="label-icon">Aa</span></button><button className={section ? 'active' : ''} onClick={() => setSection(value => !value)} title="Toggle section clipping" aria-label="Toggle section view" aria-pressed={section}><Scissors size={18} /></button><button className={exploded ? 'active' : ''} onClick={() => setExploded(value => !value)} title="Separate structures for study" aria-label="Toggle exploded view" aria-pressed={exploded}><Expand size={18} /></button><span className="toolbar-separator" /><button onClick={() => viewer.current?.screenshot()} title="Download current 3D view" aria-label="Download screenshot"><ArrowDownToLine size={18} /></button></div><div className="interaction-hint"><MousePointer2 size={12} /><span>Drag to rotate</span><i />Scroll to zoom<i /><span>Right drag to pan</span></div></div>
        <button className="mobile-inspector" onClick={() => setDetailsOpen(value => !value)}><span>{tab === 'practice' ? 'Practice question' : tab === 'saved' ? 'Saved collection' : selected?.name || 'Structure details'}</span><ChevronDown size={16} className={detailsOpen ? 'rotated' : ''} /></button>
      </main>

      <aside className={`inspector ${detailsOpen ? 'inspector-open' : ''}`} aria-label={tab === 'practice' ? 'Practice question' : 'Structure details'}>
        <div className="inspector-heading"><span>{tab === 'practice' ? 'PRACTICE SESSION' : tab === 'saved' ? 'YOUR COLLECTION' : 'STRUCTURE INSPECTOR'}</span><button className="icon-button mobile-close" onClick={() => setDetailsOpen(false)} aria-label="Close details"><X size={17} /></button>{tab === 'atlas' && <CircleDot size={14} />}</div>
        {tab === 'practice' ? <div className="practice-content"><div className="practice-mode"><span><Sparkles size={14} /> Identify in 3D</span><span>{quizScore.total + (quiz?.answer ? 0 : 1) < 10 ? '0' : ''}{quizScore.total + (quiz?.answer ? 0 : 1)}</span></div><h2>Which structure<br />is highlighted?</h2><p className="inspector-intro">Use the model to study its shape and position, then choose your answer.</p>{quiz ? <><div className="answer-options">{quiz.options.map((option, index) => { const correct = !!quiz.answer && option.id === quiz.target.id; const incorrect = quiz.answer === option.id && !correct; return <button key={option.id} disabled={!!quiz.answer} className={`${correct ? 'answer-correct' : ''} ${incorrect ? 'answer-incorrect' : ''}`} onClick={() => answerQuestion(option.id)}><span className="option-letter">{String.fromCharCode(65 + index)}</span><span>{option.name}</span>{correct ? <Check size={16} /> : incorrect ? <X size={16} /> : null}</button>; })}</div>{quiz.answer && <div className={`quiz-feedback ${quiz.answer === quiz.target.id ? 'feedback-correct' : ''}`}><strong>{quiz.answer === quiz.target.id ? 'That’s correct.' : 'Keep building the connection.'}</strong><p>The highlighted structure is <b>{quiz.target.name}</b>.</p><button className="primary-button" onClick={newQuestion}>Next structure <ArrowRight size={16} /></button><button className="text-button feedback-explore" onClick={() => { setSelectedId(quiz.target.id); setTab('atlas'); setQuiz(null); }}>Explore this structure <ArrowUpRight size={12} /></button></div>}</> : <div className="practice-waiting"><LoaderCircle size={20} className="spin" /><p>{viewerLoading ? 'Preparing a question…' : 'Enable a system with at least four visible structures to begin.'}</p></div>}<div className="practice-session-footer"><span>Session progress</span><strong>{quizScore.correct} / {quizScore.total} correct</strong><div className="score-track"><span style={{ width: `${quizScore.total ? quizScore.correct / quizScore.total * 100 : 0}%` }} /></div><small>Structure identification from source catalogue labels. No clinical assessment.</small></div></div> : tab === 'saved' ? <div className="saved-content"><h2>Your study,<br />at your pace.</h2><p className="inspector-intro">Keep structures and views close. Everything is saved on this device.</p><div className="saved-section-title"><span>Saved views</span><b>{scenes.length}</b><button onClick={() => { setSceneName(systemTitle); setModal('save'); }} aria-label="Save current view" title="Save current view"><Plus size={15} /></button></div>{scenes.length ? <div className="saved-scenes">{scenes.map(scene => <div className="saved-scene" key={scene.id}><button onClick={() => restoreScene(scene)}><span className="scene-icon"><Layers3 size={17} /></span><span><strong>{scene.name}</strong><small>{scene.systems.map(s => systemNames[s]).join(' + ')}<span> · {new Date(scene.created).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></small></span><ChevronRight size={14} /></button><button className="delete-scene" title={`Delete ${scene.name}`} aria-label={`Delete saved view ${scene.name}`} onClick={() => setScenes(items => items.filter(s => s.id !== scene.id))}><Trash2 size={13} /></button></div>)}</div> : <div className="saved-empty"><Layers3 size={22} /><p>Frame a view you want to return to.</p><button onClick={() => { setSceneName(systemTitle); setModal('save'); }}>Save this view <Plus size={13} /></button></div>}<div className="saved-section-title"><span>Bookmarked structures</span><b>{favouriteStructures.length}</b></div>{favouriteStructures.length ? <div className="saved-structures">{favouriteStructures.map(item => <div key={item.id}><button onClick={() => chooseStructure(item.id)}><Bone size={15} /><span>{item.name}<small>{systemNames[item.system]} · {pretty(item.region)}</small></span><ChevronRight size={13} /></button><button onClick={() => toggleFavourite(item.id)} title="Remove bookmark" aria-label={`Remove ${item.name} bookmark`}><Bookmark size={14} fill="currentColor" /></button></div>)}</div> : <div className="saved-empty compact"><Bookmark size={20} /><p>Select a structure and tap its bookmark.</p></div>}<button className="secondary-button export-button" disabled={!scenes.length && !favourites.length} onClick={exportBookmarks}><ArrowDownToLine size={15} /> Export study collection</button><p className="device-note">No account needed. Clearing browser data removes local saves.</p></div> : selected ? <>
          <div className="selected-content"><div className="structure-category"><span className={`category-dot category-${selected.system}`} />{systemNames[selected.system]} system<button className={`bookmark-button ${favourites.includes(selected.id) ? 'bookmarked' : ''}`} onClick={() => toggleFavourite(selected.id)} aria-label={favourites.includes(selected.id) ? 'Remove bookmark' : 'Bookmark structure'} title={favourites.includes(selected.id) ? 'Remove bookmark' : 'Bookmark structure'}><Bookmark size={19} fill={favourites.includes(selected.id) ? 'currentColor' : 'none'} /></button></div><h2>{selected.name}</h2><div className="detail-pills">{selected.laterality && <span>{pretty(selected.laterality)}</span>}<span>{pretty(selected.region || 'Unspecified region')}</span></div><div className="selection-actions"><button className={isolatedId === selected.id ? 'active' : ''} onClick={() => setIsolatedId(current => current === selected.id ? null : selected.id)} title="Isolate selection (I)"><Maximize size={15} /><span>{isolatedId === selected.id ? 'Show all' : 'Isolate'}</span></button><button onClick={() => viewer.current?.focus(selected.id)} title="Focus selection (F)"><Focus size={16} /><span>Focus</span></button><button className={hiddenIds.includes(selected.id) ? 'active' : ''} onClick={() => toggleHidden(selected.id)} title="Toggle visibility (H)">{hiddenIds.includes(selected.id) ? <EyeOff size={16} /> : <Eye size={16} />}<span>{hiddenIds.includes(selected.id) ? 'Show' : 'Hide'}</span></button></div>
          <div className="detail-section"><div className="detail-section-title"><BookOpen size={14} /><h3>{note ? 'Anatomy overview' : 'About this structure'}</h3></div>{note ? <><p>{note.description}</p><ul className="anatomy-points">{note.points.map(point => <li key={point}>{point}</li>)}</ul><a className="source-reference" href={note.reference.url} target="_blank" rel="noreferrer">{note.reference.title}<ArrowUpRight size={12} /></a><span className="review-status">Source-based note · Clinical review pending</span></> : <><p>This structure is identified by the source anatomy catalogue. Explore its position in 3D, isolate it, or compare it with nearby structures.</p><span className="review-status">Catalogue entry · No reviewed study note</span></>}</div>
          {annotationPanel}<div className="detail-section metadata-section"><h3>Model information</h3>{selected.reviewStatus && <p className="model-review-note">{selected.reviewStatus}{selected.assetPath?'. This overlay is approximate.':''}</p>}<dl><div><dt>Source</dt><dd>{selected.source || 'BodyParts3D'}</dd></div><div><dt>Structure ID</dt><dd className="mono">{selected.sourceId || selected.id}</dd></div><div><dt>System</dt><dd>{systemNames[selected.system]}</dd></div>{selected.sourceLicense&&<div><dt>Licence</dt><dd>{selected.sourceLicense}</dd></div>}{selected.laterality && <div><dt>Laterality</dt><dd>{pretty(selected.laterality)}</dd></div>}</dl>{!!selected.synonyms?.length && <div className="synonyms"><span>Also known as</span><p>{selected.synonyms.join(' · ')}</p></div>}<button className="text-link" onClick={() => setModal('sources')}>Dataset provenance <ArrowUpRight size={12} /></button></div></div>
          <div className="inspector-bottom"><span className="layer-caption"><Layers3 size={15} /><span>Layer opacity</span><b>{Math.round(opacity * 100)}%</b></span><input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={event => setOpacity(Number(event.target.value))} aria-label="Layer opacity" /><div className="opacity-ends"><span>Transparent</span><span>Solid</span></div></div>
        </> : <><div className="unselected-content"><span className="unselected-art"><MousePointer2 size={28} strokeWidth={1.3} /><i /><i /></span><span className="mini-eyebrow">START WITH CURIOSITY</span><h2>Every structure<br />has a story.</h2><p>Select any part of the model to explore its name, location and anatomy.</p><div className="empty-detail-steps"><span><span>01</span> Rotate to find your perspective</span><span><span>02</span> Select a structure to look closer</span><span><span>03</span> Save it for your next session</span></div><button className="secondary-button" onClick={() => { setSidebarOpen(true); searchInput.current?.focus(); }}><Search size={15} /> Find a structure</button>{annotationPanel}<button className="try-practice" onClick={() => openTab('practice')}><BookOpen size={15} /><span>Put your knowledge into practice</span><ArrowRight size={14} /></button></div><div className="inspector-bottom"><span className="layer-caption"><Layers3 size={15} /><span>Layer opacity</span><b>{Math.round(opacity * 100)}%</b></span><input type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={event => setOpacity(Number(event.target.value))} aria-label="Layer opacity" /><div className="opacity-ends"><span>Transparent</span><span>Solid</span></div></div></>}
        <div className="medical-note"><span /><p>Made for learning anatomy.<br />Not for diagnosis or clinical decisions.</p></div>
      </aside>
    </div>

    {toast && <div className="toast" role="status"><CheckCheck size={17} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={14} /></button></div>}

    {modal && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}><section className={`modal ${modal === 'sources' ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1}><button className="modal-close icon-button" onClick={() => setModal(null)} aria-label="Close dialog"><X size={20} /></button>{modal === 'save' ? <><span className="modal-icon"><Bookmark size={23} /></span><span className="mini-eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2 id="modal-title">Save your view.</h2><p>Keep the active systems, selection, layers and orientation together in your collection.</p><form onSubmit={event => { event.preventDefault(); saveScene(); }}><label className="form-label" htmlFor="scene-name">View name</label><input ref={sceneNameInput} id="scene-name" className="text-input" value={sceneName} onChange={event => setSceneName(event.target.value)} maxLength={80} placeholder="e.g. Bones of the shoulder" required /><div className="save-summary"><Layers3 size={15} /><span>{activeSystems.map(s => systemNames[s]).join(' + ')}<small>{pretty(direction)} view{selected ? ` · ${selected.name}` : ''}</small></span></div><button type="submit" className="primary-button" disabled={!sceneName.trim()}>Save view <Bookmark size={16} /></button></form><small className="modal-footnote">Saved locally on this device. No account required.</small></> : modal === 'help' ? <><span className="modal-icon"><MousePointer2 size={23} /></span><span className="mini-eyebrow">MAKE YOURSELF AT HOME</span><h2 id="modal-title">A little orientation.</h2><p>Your workspace for exploring real 3D anatomy at your own pace.</p><div className="help-controls"><div><Move size={18} /><span><strong>Rotate</strong><small>Click and drag · One finger on touch</small></span></div><div><Expand size={18} /><span><strong>Zoom & pan</strong><small>Scroll to zoom · Right drag to pan<br />Pinch or two fingers on touch</small></span></div><div><MousePointer2 size={18} /><span><strong>Select a structure</strong><small>Click the model or use the structure list</small></span></div></div><div className="shortcut-grid"><span>Search anatomy<kbd>/</kbd></span><span>Focus selection<kbd>F</kbd></span><span>Reset camera<kbd>R</kbd></span><span>Hide selection<kbd>H</kbd></span><span>Isolate selection<kbd>I</kbd></span><span>Exit isolation<kbd>Esc</kbd></span></div><button className="primary-button" onClick={() => setModal(null)}>Start exploring <ArrowRight size={16} /></button></> : modal === 'settings' ? <><span className="modal-icon"><Settings2 size={23} /></span><span className="mini-eyebrow">YOUR WORKSPACE</span><h2 id="modal-title">Viewer settings.</h2><p>Choose the rendering quality that feels right on your device.</p><fieldset className="quality-options"><legend>Rendering quality</legend><button className={quality === 'balanced' ? 'selected' : ''} onClick={() => setQuality('balanced')}><span className="radio-dot">{quality === 'balanced' && <i />}</span><span><strong>Balanced <small>Recommended</small></strong><p>Lighter geometry and resolution; every structure stays selectable.</p></span></button><button className={quality === 'high' ? 'selected' : ''} onClick={() => setQuality('high')}><span className="radio-dot">{quality === 'high' && <i />}</span><span><strong>High quality</strong><p>Full-detail source geometry and higher resolution rendering.</p></span></button></fieldset><div className="settings-toggle"><span><strong>Selection labels</strong><small>Show the selected structure name in 3D.</small></span><button className={`switch ${labels ? 'switch-on' : ''}`} role="switch" aria-checked={labels} aria-label="Show selection labels" onClick={() => setLabels(value => !value)}><span /></button></div><div className="settings-info"><Layers3 size={16} /><p>Structures loaded: <strong>{metrics?.meshes.toLocaleString() ?? '—'}</strong><br />Triangles: <strong>{metrics?.triangles.toLocaleString() ?? '—'}</strong></p></div><button className="primary-button" onClick={() => setModal(null)}>Done <Check size={16} /></button></> : <><span className="modal-icon"><Layers3 size={23} /></span><span className="mini-eyebrow">OPEN BY DESIGN</span><h2 id="modal-title">Good learning starts<br />with clear sources.</h2><p>Anatomy Studio is an independent educational workspace built with openly licensed anatomy data.</p><div className="source-card"><span className="source-number">01</span><div><h3>BodyParts3D / Anatomography</h3><p>BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International. Geometry has been adapted for the web and display colours modified. Models may contain incomplete or simplified anatomy.</p><div className="source-card-links"><a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/" target="_blank" rel="noreferrer">Dataset <ArrowUpRight size={12} /></a><a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html" target="_blank" rel="noreferrer">Source licence <ArrowUpRight size={12} /></a><a href="/data/licenses.json" target="_blank" rel="noreferrer">Build provenance <ArrowUpRight size={12} /></a></div></div></div><div className="source-card"><span className="source-number">02</span><div><h3>OpenStax · Anatomy and Physiology 2e</h3><p>Selected skeletal study notes are paraphrased from the linked OpenStax chapters. Each note links its source and is marked as awaiting clinical review.</p><a href="https://openstax.org/details/books/anatomy-and-physiology-2e" target="_blank" rel="noreferrer">Read the textbook <ArrowUpRight size={12} /></a></div></div><div className="source-card"><span className="source-number">03</span><div><h3>Z-Anatomy · Selected lung & liver surfaces</h3><p>Five lung lobes and the liver are adapted from Z-Anatomy via the nqwrc 3d-anatomy conversion. These six adapted meshes are licensed CC BY-SA 4.0. BodyParts3D and Z-Anatomy contributors are credited in the licence. Alignment is approximate and awaits anatomy review; held-out thoracic landmarks differ by 3–9.4 mm. Other third-party kidney, inner ear and brain assets are excluded.</p><div className="source-card-links"><a href="/models/supplement/LICENSE.txt" target="_blank" rel="noreferrer">Attribution & licence</a><a href="/data/supplement-provenance.json" target="_blank" rel="noreferrer">Alignment & provenance</a></div></div></div><div className="source-integrity"><CircleHelp size={18} /><p>Catalogue labels and 3D models support study. They do not replace a formal curriculum, expert instruction or clinical reference. Notes have not been signed off by a qualified medical reviewer.</p></div><button className="primary-button" onClick={() => setModal(null)}>Back to the atlas <ArrowRight size={16} /></button></>}</section></div>}
  </div>;
}
