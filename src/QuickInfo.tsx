import {BookOpen,ArrowUpRight} from 'lucide-react';
import type {Structure} from './types';
import {getQuickInfo} from './quick-info';
import './quick-info.css';

export default function QuickInfo({structure}:{structure:Structure}){
  const info=getQuickInfo(structure);
  return <section className="quick-info" aria-label="In simple words">
    <div className="quick-info-heading"><BookOpen size={15} aria-hidden="true"/><h3>In simple words</h3></div>
    {info.scope==='general'&&<span className="quick-info-scope">{info.topic==='general-other'?'System overview':'General context'}</span>}
    {info.sentences.map((sentence,index)=><p key={index}>{sentence}</p>)}
    <details><summary>Source &amp; review</summary><p>{info.scope==='general'?(info.topic==='general-other'?'This is context for the body system, rather than an individual function description.':'This describes the type of structure, not the exact role of every named branch.'):info.scope==='source-action'?'Simplified from one action listed in the Atlas. The complete source text is below.':'A short educational overview, matched to the source label.'}</p><a href={info.reference.url} target="_blank" rel="noreferrer">{info.reference.title}<ArrowUpRight size={12} aria-hidden="true"/></a><small>AI-assisted wording · Medical review pending</small></details>
  </section>;
}
