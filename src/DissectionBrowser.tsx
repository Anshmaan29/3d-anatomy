import { useId, useMemo, useState } from 'react';
import { ArrowUpRight, Brain, Check, ChevronDown, ChevronUp, CircleHelp, Ear, Eye, Heart, Layers3, Search, X } from 'lucide-react';
import type { CameraState, SystemId } from './types';
import './dissection-browser.css';

export interface DissectionPreset {
  id: string;
  name: string;
  region: string;
  systems: SystemId[];
  visibleIds: string[];
  focusIds?: string[];
  camera?: CameraState;
  viewpoints?:{id:string;name:string;target:[number,number,number];focusIds?:string[]}[];
  category?: string;
  description?: string;
  sourceEvidence?: unknown;
  steps?: { name: string; visibleIds: string[]; focusIds?: string[] }[];
}
interface Props {
  scenes: DissectionPreset[];
  collections: DissectionPreset[];
  activeId?: string | null;
  onOpen: (preset: DissectionPreset) => void;
}
const PAGE_SIZE = 10;
const searchText = (value: string) => value.toLocaleLowerCase('en').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const label = (value: string) => value.replace(/[_-]+/g, ' ').replace(/^\w/, character => character.toUpperCase());
function ViewIcon({ name }: { name: string }) {
  if (/brain|cerebr|neuro|cranial nerve/i.test(name)) return <Brain size={19} aria-hidden="true" />;
  if (/heart|cardiac|coronar/i.test(name)) return <Heart size={19} aria-hidden="true" />;
  if (/ear|auditory|cochlea|vestibul/i.test(name)) return <Ear size={19} aria-hidden="true" />;
  if (/eye|orbit|ocular|retina/i.test(name)) return <Eye size={19} aria-hidden="true" />;
  return <Layers3 size={19} aria-hidden="true" />;
}

export default function DissectionBrowser({ scenes, collections, activeId, onOpen }: Props) {
  const controlId = useId();
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState<'organs' | 'scenes'>('organs');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const source = tab === 'organs' ? collections : scenes;
  const regions = useMemo(() => [...new Set(source.map(item => item.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en')), [source]);
  const filtered = useMemo(() => {
    const words = searchText(query).trim().split(/\s+/).filter(Boolean);
    return source.filter(item => (region === 'all' || item.region === region) && words.every(word => searchText(`${item.name} ${item.region} ${item.category || ''} ${item.description || ''}`).includes(word)));
  }, [source, query, region]);
  const changeTab = (value: 'organs' | 'scenes') => { setTab(value); setRegion('all'); setLimit(PAGE_SIZE); };
  const clearFilters = () => { setQuery(''); setRegion('all'); setLimit(PAGE_SIZE); };
  return <section className={`dissection-browser ${expanded ? 'dissection-browser-expanded' : ''}`} aria-label="Prepared anatomy views">
    <button type="button" className="dissection-browser-heading" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls={`${controlId}-body`}>
      <span className="dissection-heading-icon"><Layers3 size={16} aria-hidden="true" /></span>
      <span><strong>Explore deeper</strong><small>Organs, brain & prepared views</small></span>
      {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
    </button>
    {expanded && <div id={`${controlId}-body`} className="dissection-browser-body">
      <div className="dissection-tabs" role="group" aria-label="View collection">
        <button type="button" onClick={() => changeTab('organs')} aria-pressed={tab === 'organs'} className={tab === 'organs' ? 'active' : ''}>Inside organs <span>{collections.length}</span></button>
        <button type="button" onClick={() => changeTab('scenes')} aria-pressed={tab === 'scenes'} className={tab === 'scenes' ? 'active' : ''}>Atlas scenes <span>{scenes.length}</span></button>
      </div>
      <div className="dissection-filters">
        <label className="dissection-search"><Search size={15} aria-hidden="true" /><input value={query} placeholder={tab === 'organs' ? 'Brain, heart, kidney…' : 'Search prepared views…'} aria-label="Search prepared anatomy views" onChange={event => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} />{query && <button type="button" aria-label="Clear view search" onClick={() => { setQuery(''); setLimit(PAGE_SIZE); }}><X size={14} aria-hidden="true" /></button>}</label>
        {regions.length > 1 && <label className="dissection-region"><span className="dissection-sr-only">Filter views by region</span><select value={region} onChange={event => { setRegion(event.target.value); setLimit(PAGE_SIZE); }}><option value="all">All regions</option>{regions.map(value => <option key={value} value={value}>{label(value)}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></label>}
      </div>
      <div className="dissection-result-summary" aria-live="polite"><span>{filtered.length} {filtered.length === 1 ? 'view' : 'views'}</span>{(query || region !== 'all') && <button type="button" onClick={clearFilters}>Clear filters</button>}</div>
      <div className="dissection-views" aria-label={tab === 'organs' ? 'Inside organ views' : 'Atlas scene views'}>
        {filtered.slice(0, limit).map(preset => {
          const partCount = new Set(preset.visibleIds).size;
          const active = activeId === preset.id;
          return <button type="button" key={preset.id} className={`dissection-view ${active ? 'dissection-view-active' : ''}`} onClick={() => onOpen(preset)} aria-pressed={active}>
            <span className="dissection-view-icon"><ViewIcon name={`${preset.name} ${preset.category || ''}`} /></span>
            <span className="dissection-view-text"><span className="dissection-view-name">{preset.name}</span>{preset.description && <span className="dissection-view-description">{preset.description}</span>}<span className="dissection-view-meta"><span>{label(preset.category || preset.region || 'Anatomy')}</span><span>{partCount.toLocaleString('en')} {partCount === 1 ? 'part' : 'parts'}</span>{preset.steps && preset.steps.length > 1 && <span>{preset.steps.length} views</span>}</span></span>
            <span className="dissection-view-open">{active ? <Check size={16} aria-hidden="true" /> : <ArrowUpRight size={16} aria-hidden="true" />}<span className="dissection-sr-only">{active ? 'Current view' : 'Open view'}</span></span>
          </button>;
        })}
        {!filtered.length && <div className="dissection-empty"><Search size={20} aria-hidden="true" /><strong>{source.length ? 'No matching views' : 'No prepared views available'}</strong><p>{source.length ? 'Try an organ name or choose another region.' : 'Browse individual structures in the anatomy library.'}</p>{source.length > 0 && <button type="button" onClick={clearFilters}>Show all views</button>}</div>}
        {filtered.length > limit && <button type="button" className="dissection-show-more" onClick={() => setLimit(value => value + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, filtered.length - limit)} more views <ChevronDown size={15} aria-hidden="true" /><span>{filtered.length - limit} remaining</span></button>}
      </div>
      <p className="dissection-review-note"><CircleHelp size={13} aria-hidden="true" /><span>Study views use source anatomy. Labels await independent medical review.</span></p>
    </div>}
  </section>;
}
