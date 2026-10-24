import { useEffect, useId, useRef, useState } from 'react';
import { Check, Focus, MapPin, Plus, Trash2, X } from 'lucide-react';
import type { Annotation, AnnotationAnchor } from './types';

interface AnnotationPanelProps {
  annotations: Annotation[];
  placing: boolean;
  onPlacingChange: (value: boolean) => void;
  pendingAnchor: AnnotationAnchor | null;
  onCancelAnchor: () => void;
  onSave: (text: string) => void;
  onDelete: (id: string) => void;
  onFocus: (annotation: Annotation) => void;
}

export default function AnnotationPanel({ annotations, placing, onPlacingChange, pendingAnchor, onCancelAnchor, onSave, onDelete, onFocus }: AnnotationPanelProps) {
  const [text, setText] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const textareaId = useId();
  const instructionsId = useId();

  useEffect(() => {
    setText('');
    if (pendingAnchor) {
      const timer = window.setTimeout(() => textarea.current?.focus(), 40);
      return () => window.clearTimeout(timer);
    }
  }, [pendingAnchor]);

  const cancelPlacement = () => { onCancelAnchor(); onPlacingChange(false); setText(''); };
  const togglePlacement = () => {
    if (placing || pendingAnchor) cancelPlacement();
    else onPlacingChange(true);
  };

  return <section className="annotation-panel" aria-labelledby={`${textareaId}-title`}>
    <div className="annotation-heading">
      <h3 id={`${textareaId}-title`}><MapPin size={14} />3D annotations <span>{annotations.length}</span></h3>
      <button className={`annotation-pin-button ${placing || pendingAnchor ? 'annotation-pin-active' : ''}`} onClick={togglePlacement} aria-pressed={placing || !!pendingAnchor} title={placing || pendingAnchor ? 'Cancel pin placement' : 'Attach a note to a point on the anatomy'}>{placing || pendingAnchor ? <X size={12} /> : <Plus size={12} />}<span>{placing || pendingAnchor ? 'Cancel' : 'Pin a note'}</span></button>
    </div>

    {pendingAnchor ? <form className="annotation-editor" onSubmit={(event) => { event.preventDefault(); if (text.trim()) onSave(text.trim()); }}>
      <div className="annotation-anchor-status"><span /><span>Point selected on the model</span><Check size={12} /></div>
      <label htmlFor={textareaId}>Your annotation</label>
      <textarea ref={textarea} id={textareaId} value={text} onChange={(event) => setText(event.target.value)} placeholder="Name a landmark, add a question or make a study note…" maxLength={180} rows={3} required aria-describedby={instructionsId} />
      <div className="annotation-editor-footer"><span aria-live="polite">{text.length}<span> / 180</span></span><div><button type="button" className="annotation-cancel-button" onClick={cancelPlacement}>Cancel</button><button type="submit" className="annotation-save-button" disabled={!text.trim()}><Check size={12} />Save pin</button></div></div>
    </form> : placing ? <div className="annotation-placement" role="status"><span className="annotation-placement-icon"><MapPin size={17} /></span><div><strong>Click a point on the model</strong><p>Your note will stay attached to that exact point.</p></div></div> : null}

    {!!annotations.length && <div className="annotation-list" aria-label="Saved 3D annotations">{annotations.map((annotation, index) => <div className="annotation-item" key={annotation.id}>
      <span className="annotation-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <button className="annotation-note" onClick={() => onFocus(annotation)} title={`Focus this note on ${annotation.structureId}`}><span>{annotation.text}</span><small><MapPin size={8} />{annotation.structureId}</small></button>
      <div className="annotation-item-actions"><button onClick={() => onFocus(annotation)} aria-label={`Focus annotation: ${annotation.text}`} title="Focus annotation"><Focus size={13} /></button><button className="annotation-delete" onClick={() => onDelete(annotation.id)} aria-label={`Delete annotation: ${annotation.text}`} title="Delete annotation"><Trash2 size={12} /></button></div>
    </div>)}</div>}

    {!annotations.length && !placing && !pendingAnchor && <p className="annotation-empty">Attach your own notes to anatomical landmarks.</p>}
    <p className="annotation-help" id={instructionsId}>Pins follow the anatomy as you rotate, zoom and pan. Notes are saved on this device.</p>
  </section>;
}
