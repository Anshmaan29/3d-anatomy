#!/usr/bin/env python3
"""Build English dissection presets from authorized Atlas scene hierarchy evidence.

The native database supplies titles, not membership. Membership is resolved from
level MeshFilter PPtrs, renderer flags and active GameObject ancestor chains.
Requires UnityPy and numpy in the existing local analysis virtual environment.
No native camera pose is invented; web views fit the canonical exported bounds.
"""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import sqlite3

import numpy as np
import UnityPy


def load(path):
    return json.loads(path.read_text())


def matrix(t):
    x, y, z, w = t['rotation']
    r = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                  [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                  [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    m = np.eye(4)
    m[:3, :3] = r @ np.diag(t['scale'])
    m[:3, 3] = t['position']
    return m


def normalize(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--analysis', type=Path, default=Path('data-source/atlas-analysis'))
    p.add_argument('--source-data', type=Path, default=Path('/Applications/Anatomy 3D Atlas.app/Contents/Resources/Data'))
    p.add_argument('--output', type=Path, default=Path('public/data/atlas-scenes.json'))
    args = p.parse_args()
    decoded = args.analysis/'decoded'
    catalog = load(Path('public/data/atlas.json'))
    structures = {s['id']: s for s in catalog['structures']}
    by_code = {s['sourceCode']: s for s in structures.values()}
    meshes = {m['pathId']: m for m in load(decoded/'meshes.json')}
    gameobjects = {(g['file'], g['pathId']): g for g in load(decoded/'gameobjects.json')}
    transforms = {(t['file'], t['pathId']): t for t in load(decoded/'transforms.json')}
    go_transforms = {(t['file'], t['gameObject']): t for t in transforms.values()}
    filters = load(decoded/'meshfilters.json')
    renderers = {(r['file'], r['gameObject']): r for r in load(decoded/'renderers.json')}
    materials = {m['pathId']: m for m in load(decoded/'materials.json') if m['file']=='resources.assets'}
    world_cache = {}

    def world(t):
        key = (t['file'], t['pathId'])
        if key not in world_cache:
            parent = transforms.get((t['file'], t['parent']))
            world_cache[key] = world(parent) @ matrix(t) if parent else matrix(t)
        return world_cache[key]

    def ancestors(t):
        result = []
        while t:
            result.append(gameobjects[(t['file'], t['gameObject'])])
            t = transforms.get((t['file'], t['parent']))
        return result

    # Match the canonical instance selection used by export-atlas-web.py.
    canonical_candidates = collections.defaultdict(list)
    for f in filters:
        if f['file']!='resources.assets' or f['mesh']['fileId']!=0:
            continue
        mesh = meshes.get(f['mesh']['pathId'])
        t = go_transforms.get((f['file'], f['gameObject']))
        if mesh and t and mesh['name'] in by_code:
            chain = ancestors(t)
            refs = renderers[(f['file'],f['gameObject'])]['materials']
            mats = [materials.get(r['pathId'], {}) for r in refs]
            placeholder = not mats or all(m.get('name','Default-Material')=='Default-Material' for m in mats)
            score = (placeholder, chain[0]['name']!=mesh['name'], 'Multicolor' in chain[-1]['name'], 'Variant' in chain[-1]['name'], f['gameObject'])
            canonical_candidates[mesh['name']].append((score, world(t), chain[-1]['name']))
    canonical = {code: sorted(options,key=lambda o:o[0])[0][1] for code,options in canonical_candidates.items()}
    canonical_roots = {code: sorted(options,key=lambda o:o[0])[0][2] for code,options in canonical_candidates.items()}
    registration = np.diag([.2,.2,-.2,1.]); registration[1,3]=-1.7
    db = sqlite3.connect(args.analysis/'labels/catalog.sqlite'); db.row_factory=sqlite3.Row
    rows = [dict(r) for r in db.execute('SELECT * FROM scenes')]
    pov_rows = [dict(r) for r in db.execute('SELECT * FROM pov')]
    scene_rows = {normalize(r['en_name']+' '+(r['en_name_2'] or '')):r for r in rows}
    regions = {r['id']:r['en_name'] for r in db.execute('SELECT * FROM regions')}
    native_scenes = []
    diagnostics = []
    for level_number in range(1,71):
        file = f'level{level_number}'
        roots = [g for (f,_),g in gameobjects.items() if f==file and (t:=go_transforms.get((f,g['pathId']))) and not t['parent']]
        assert len(roots)==1, f'{file} must have one anatomical root'
        root = roots[0]
        row = scene_rows.get(normalize(root['name']))
        if row is None:
            assert level_number==1, f'Unmatched source scene {file}: {root["name"]}'
        env = UnityPy.load(str(args.source_data/file))
        assets = next(a for a in env.assets if a.name==file)
        external_files = {i+1:Path(ex.path).name for i,ex in enumerate(assets.externals)}
        enabled = {}
        for obj in env.objects:
            if obj.type.name=='MeshRenderer':
                d=obj.parse_as_object(); enabled[d.m_GameObject.m_PathID]=bool(d.m_Enabled)
        members, visible, hidden = set(),set(),set()
        mapped = []
        inactive_count = disabled_count = unmapped_anatomy = 0
        for f in filters:
            if f['file']!=file: continue
            ref=f['mesh']
            if external_files.get(ref['fileId'])!='resources.assets': continue
            mesh=meshes.get(ref['pathId'])
            if not mesh: continue
            structure=by_code.get(mesh['name'])
            if not structure:
                if re.match(r'^[A-Za-z]+_M',mesh['name']): unmapped_anatomy+=1
                continue
            id=structure['id']; members.add(id)
            t=go_transforms[(file,f['gameObject'])]
            active=all(g['active'] for g in ancestors(t))
            shown=enabled.get(f['gameObject'],False)
            if active and shown: visible.add(id)
            else:
                hidden.add(id);inactive_count+=int(not active);disabled_count+=int(not shown)
            mapped.append((id,world(t) @ np.linalg.inv(canonical[mesh['name']])))
        # A common placement transform maps canonical mesh coordinates to a
        # scene's isolated/rotated composition. Retain only alignment diagnostics.
        groups=collections.defaultdict(list)
        for id,delta in mapped:groups[tuple(np.round(delta.flatten(),3))].append((id,delta))
        dominant=max(groups.values(),key=len) if groups else []
        alignment=len(dominant)/len(mapped) if mapped else 0
        common=dominant[0][1] if dominant else np.eye(4)
        source_id=row['id'] if row else None
        id=f'atlas-{source_id}' if row else 'atlas-full-body'
        region=regions.get(row['region_id'],'Whole body') if row else 'Whole body'
        source_evidence={'kind':'unity-scene-membership','file':file,'sha256':hashlib.sha256((args.source_data/file).read_bytes()).hexdigest(),
                         'rootName':root['name'],'rootGameObjectPathId':root['pathId'],'catalogSceneId':source_id,
                         'membership':'MeshFilter external PPtr -> resources.assets mesh sourceCode',
                         'visibility':'GameObject active state through all ancestors AND MeshRenderer enabled',
                         'canonicalPlacementAgreement':round(alignment,4)}
        viewpoints=[]
        for pov in [p for p in pov_rows if p['scene_id']==source_id]:
            marker=[g for (f,_),g in gameobjects.items() if f==file and g['name']==f'Pov_{pov["pov_number"]}']
            item={'id':f'atlas-pov-{pov["id"]}','name':pov['en_label'].strip(),'sourceNumber':pov['pov_number'],'sceneId':id,'focusIds':[],
                  'sourceEvidence':{'catalogTable':'pov','catalogId':pov['id'],'markerFound':len(marker)==1}}
            if len(marker)==1 and alignment>=.9:
                t=go_transforms[(file,marker[0]['pathId'])]
                source_point=world(t)[:,3]
                target=(registration @ np.linalg.inv(common) @ source_point)[:3]
                item['target']=[round(float(v),6) for v in target]
                # Marker targets are anatomical reference points, not source
                # camera poses. Focus the nearest exported visible structures.
                distances=[]
                for sid in visible:
                    b=np.asarray(structures[sid]['bounds'])
                    distance=np.linalg.norm(np.maximum(np.maximum(b[0]-target,target-b[1]),0))
                    distances.append((float(distance),sid))
                distances.sort()
                if distances:
                    cutoff=max(.035,distances[0][0]+.018)
                    item['focusIds']=[sid for distance,sid in distances if distance<=cutoff][:18]
                item['sourceEvidence']['targetMapping']='source marker transformed through dominant scene-to-canonical alignment'
            viewpoints.append(item)
        assert visible, f'{file}: no visible anatomical surfaces'
        native_scenes.append({'id':id,'name':root['name'].replace(' - ',' · '),'region':region,
            'systems':sorted({structures[i]['system'] for i in visible}),'visibleIds':sorted(visible),
            'memberIds':sorted(members),'sourceHiddenIds':sorted(hidden-visible),
            'focusIds':sorted(visible),'category':'Source dissections','description':'Recovered native scene membership, adapted to the shared anatomical coordinate space.',
            'cameraMode':'fit-bounds','viewpoints':viewpoints,'sourceEvidence':source_evidence})
        diagnostics.append({'scene':id,'file':file,'name':root['name'],'members':len(members),'visible':len(visible),'inactiveInstances':inactive_count,'disabledRenderers':disabled_count,'unmappedAnatomicalMeshes':unmapped_anatomy,'alignmentAgreement':round(alignment,4)})
    assert len([s for s in native_scenes if s['sourceEvidence']['catalogSceneId'] is not None])==len(rows)==69
    assert sum(len(s['viewpoints']) for s in native_scenes)==len(pov_rows)==82
    native={s['id']:s for s in native_scenes}
    curated=[]

    def make(id,name,codes,description,source_scenes,region='Head',focus=None):
        codes=list(dict.fromkeys(codes))
        missing=[c for c in codes if c not in by_code]
        assert not missing, f'{id}: missing curated codes {missing}'
        ids=sorted(by_code[c]['id'] for c in codes)
        assert ids
        curated.append({'id':id,'name':name,'region':region,'systems':sorted({structures[i]['system'] for i in ids}),
            'visibleIds':ids,'focusIds':sorted(by_code[c]['id'] for c in focus) if focus else ids,
            'category':'Inside organs','description':description,'cameraMode':'fit-bounds',
            'sourceEvidence':{'kind':'curated-from-recovered-source-models','sourceScenes':source_scenes,
                              'selection':'Exact recovered sourceCodes; outer shells deliberately excluded',
                              'reviewStatus':'Educational arrangement; clinical review pending'}})

    brain_deep=[f'Bra_M{i}' for i in range(1008,1022)]
    make('study-brain-deep','Brain · deep structures',brain_deep,
         'Expose the thalamus, basal nuclei, fornix, commissures, choroid plexus and sectioned brainstem by removing the cerebral hemispheres and dural folds.', ['atlas-302'])
    make('study-brain-ventricles','Brain · ventricular system',['Bra_M1006','Bra_M1010','Bra_M1011','Bra_M1019','Bra_M1020'],
         'Study the recovered ventricular surfaces with the fornix and choroid plexus. Some ventricular components share a combined mesh.', ['atlas-303','atlas-302'])
    make('study-brain-medial','Brain · medial view',['Bra_M1001','Bra_M1004','Bra_M1005']+brain_deep,
         'A hemisphere with exposed deep structures for medial relationships. Hide individual structures or use the section plane to inspect the interior.', ['atlas-302'])
    circle=[c for c in by_code if c.startswith('Art_') and ('Circle of Willis' in by_code[c]['name'])]
    make('study-circle-willis','Circle of Willis',circle+['Bra_M1008','Bra_M1021'],
         'Examine the source-labeled arterial circle against the sectioned brainstem and optic tract.', ['atlas-304'])
    cardiac=[structures[i]['sourceCode'] for i in native['atlas-202']['visibleIds']]
    make('study-heart-interior','Heart · chambers and valves',cardiac,
         'Open atrial and ventricular sections with their recovered internal surfaces, valves, coronary vessels and conduction pathways.', ['atlas-202'],'Trunk')
    conduction=[c for c in by_code if c.startswith('Ner_M90')]
    make('study-heart-conduction','Heart · conduction pathways',conduction+['Hea_M4','Hea_M5','Hea_M6','Hea_M7','Hea_M8','Atrium_Int_Sez_L','Atrium_Int_Sez_R','Ventricle_Int_Sez_R','Ventricle_Int_Sez_L','Ventricles_Sez'],
         'Follow the source-modeled sinoatrial node, internodal tracts, atrioventricular node, His bundle and bundle branches within the sectioned chambers.', ['atlas-202','atlas-204'],'Trunk',conduction)
    kidney=[f'Uro_M{i}' for i in range(103,110)]
    make('study-kidney-interior','Kidney · pelvis and medulla',kidney,
         'Remove the outer kidney surface and renal-sinus fat to expose the renal pelvis, medullary pyramids, papilla and source nephron model.', ['atlas-603'],'Trunk')
    make('study-nephron','Kidney · nephron',['Uro_M107'],
         'Isolate the nephron surface present in the source atlas. This is a modeled teaching representation, not a complete microscopic dataset.', ['atlas-603'],'Trunk')
    make('study-ear-inner','Ear · middle and inner anatomy',[f'Ear_M{i}' for i in range(1001,1007)]+['Ner_M1232','Ner_M1233','Ner_M1234'],
         'Inspect the tympanic membrane, ossicles, cochlea and vestibule, semicircular canals and vestibulocochlear branches without the skull shell.', ['atlas-903'])
    make('study-eye-interior','Eye · retina and iris',['Eye_M1002','Eye_M1003','Eye_M1004','Eye_M1005'],
         'Remove the outer eyeball to expose the recovered iris, pupil, retina and optic-nerve surfaces. The source has no separately labeled lens mesh.', ['atlas-901'])
    make('study-digestive-ducts','Digestive · pancreatic ducts',['Dig_M11','Dig_M12','Dig_M13','Dig_M17'],
         'Expose the pancreatic ducts beside the duodenum and gallbladder; the pancreatic parenchyma is deliberately removed.', ['atlas-502'],'Trunk')
    make('study-airways','Respiratory · larynx and airways',[structures[i]['sourceCode'] for i in native['atlas-404']['visibleIds']],
         'Inspect the source laryngeal cartilages, ligaments and muscles with the trachea and bronchial tree.', ['atlas-404'],'Trunk')
    lung_segments=[c for c in by_code if c.startswith('Res_M') and 102<=int(c[5:])<=121]
    make('study-lung-segments','Lungs · segmental bronchi',lung_segments,
         'View twenty source-labeled segmental bronchial branches with the two outer lung shells removed. These are airway meshes, not solid segment volumes.', ['atlas-402'],'Trunk')
    preset_groups=[{'id':'brain','name':'Brain and cranial nerves','sceneIds':['study-brain-deep','study-brain-ventricles','study-brain-medial','study-circle-willis','atlas-305','atlas-301']},
        {'id':'heart','name':'Heart and circulation','sceneIds':['study-heart-interior','study-heart-conduction','atlas-201']},
        {'id':'kidney','name':'Kidney and urinary anatomy','sceneIds':['study-kidney-interior','study-nephron','atlas-603','atlas-601','atlas-604']},
        {'id':'senses','name':'Eye and ear','sceneIds':['study-ear-inner','study-eye-interior','atlas-903','atlas-901']},
        {'id':'viscera','name':'Thoracic and abdominal organs','sceneIds':['study-airways','study-lung-segments','study-digestive-ducts','atlas-402','atlas-502','atlas-1001']}]
    category_by_id = {
        'study-brain-deep':'Brain','study-brain-ventricles':'Brain','study-brain-medial':'Brain','study-circle-willis':'Brain',
        'study-heart-interior':'Heart','study-heart-conduction':'Heart',
        'study-kidney-interior':'Kidney','study-nephron':'Kidney','study-ear-inner':'Ear','study-eye-interior':'Eye',
        'study-digestive-ducts':'Digestive','study-airways':'Respiratory','study-lung-segments':'Respiratory'}
    presets = {s['id']:s for s in curated}
    for preset in curated:
        preset['category'] = category_by_id[preset['id']]
    def step(name, codes, description):
        assert codes and all(code in by_code for code in codes)
        return {'name':name,'visibleIds':sorted(by_code[c]['id'] for c in codes),'description':description}
    presets['study-brain-deep']['steps'] = [
        step('Deep structures',brain_deep,'The cerebral hemispheres and dural folds are hidden.'),
        step('Basal nuclei and thalamus',[f'Bra_M{i}' for i in range(1012,1017)],'Isolate the recovered basal nuclei, amygdala and thalamus meshes.'),
        step('Fornix and commissures',['Bra_M1009','Bra_M1010','Bra_M1011','Bra_M1017','Bra_M1018'],'Inspect corpus callosum, fornix and source-modeled commissures.'),
        step('Ventricles and choroid plexus',['Bra_M1006','Bra_M1010','Bra_M1019','Bra_M1020'],'Relate the ventricular surfaces to the fornix and choroid plexus.')]
    chambers=['Hea_M4','Hea_M5','Hea_M6','Atrium_Int_Sez_L','Atrium_Int_Sez_R','Ventricle_Int_Sez_R','Ventricle_Int_Sez_L','Ventricles_Sez']
    presets['study-heart-interior']['steps'] = [
        step('Open chambers',chambers+['Hea_M7','Hea_M8'],'Sectioned atria and ventricles expose the internal surfaces and atrioventricular valves.'),
        step('Atrioventricular valves',['Hea_M7','Hea_M8'],'Isolate the tricuspid and mitral valve meshes.'),
        step('Conduction pathways',conduction+chambers,'Follow the recovered conduction meshes within the chamber sections.'),
        step('Coronary relationships',cardiac,'Restore coronary vessels and the full recovered open-heart scene.')]
    presets['study-kidney-interior']['steps'] = [
        step('Pelvis and medulla',kidney,'The outer kidney surface and renal-sinus fat are removed.'),
        step('Medulla and papilla',['Uro_M104','Uro_M105','Uro_M106'],'Inspect full and sliced medullary pyramids with the papilla.'),
        step('Pelvis and vessels',['Uro_M103','Uro_M108','Uro_M109'],'Show the collecting pelvis alongside the recovered renal artery and vein.'),
        step('Nephron representation',['Uro_M107'],'Isolate the source nephron teaching model; no unseen microscopic structures are invented.')]
    presets['study-ear-inner']['steps'] = [
        step('Middle and inner ear',[f'Ear_M{i}' for i in range(1001,1007)]+['Ner_M1232','Ner_M1233','Ner_M1234'],'The skull shell is removed.'),
        step('Ossicular chain',['Ear_M1001','Ear_M1002','Ear_M1003','Ear_M1004'],'View the tympanic membrane, malleus, incus and stapes.'),
        step('Inner ear',['Ear_M1005','Ear_M1006'],'Inspect the source cochlea and vestibule with semicircular canals.'),
        step('Vestibulocochlear branches',['Ear_M1005','Ear_M1006','Ner_M1232','Ner_M1233','Ner_M1234'],'Relate the modeled vestibular and cochlear nerve branches to the inner ear.')]
    presets['study-eye-interior']['steps'] = [
        step('Retina and iris',['Eye_M1002','Eye_M1003','Eye_M1004','Eye_M1005'],'The outer eyeball shell is removed.'),
        step('Retina and optic nerve',['Eye_M1004','Eye_M1005'],'Inspect the recovered retinal surface and optic nerve.'),
        step('Iris and pupil',['Eye_M1002','Eye_M1003'],'Isolate the iris and pupil meshes.')]
    specimen_only = sorted(by_code[code]['id'] for code,root_name in canonical_roots.items() if root_name=='Uro_Kidney_HighRes')
    assert len(specimen_only)==10 and all(sid not in native['atlas-full-body']['memberIds'] for sid in specimen_only)
    assert all([scene['id'] for scene in native_scenes if sid in scene['memberIds']]==['atlas-603'] for sid in specimen_only)
    native_surface_ids = {sid for scene in native_scenes for sid in scene['memberIds']}
    uninstanced_surface_ids = sorted(set(structures)-native_surface_ids)
    result={'version':'atlas-scenes-2026-10-24-v1','source':'Anatomical source catalogue',
            'scenes':native_scenes,'collections':curated,'groups':preset_groups,
            'specimenOnlyIds':specimen_only,'uninstancedSurfaceIds':uninstanced_surface_ids,'specimenOnlyEvidence':{'canonicalResourceRoot':'Uro_Kidney_HighRes','nativeSceneIds':['atlas-603'],'reason':'Independent kidney-section specimen, absent from full-body and every other recovered native anatomy scene. Preserve access through dissection presets and search.'},
            'coverage':{'catalogScenes':len(rows),'nativeAnatomyRoots':len(native_scenes),'curatedInteriorViews':len(curated),'catalogViewpoints':len(pov_rows),'mappedViewpointMarkers':sum(p['sourceEvidence']['markerFound'] for s in native_scenes for p in s['viewpoints']),
                        'targetMappedViewpoints':sum('target' in p for s in native_scenes for p in s['viewpoints'])},
            'limitations':['Native camera distance, orientation and runtime visibility changes have not been reproduced. Source scene membership is statically verified; web cameras fit canonical bounds.',
                'Anatomical shells and internal surfaces are selectable source meshes. Combined meshes cannot be separated into structures absent from the source.',
                'Curated inner-organ views rearrange visibility only; clinical review remains pending.']}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,separators=(',',':'))+'\n')
    (args.analysis/'scene-diagnostics.json').write_text(json.dumps(diagnostics,indent=2)+'\n')
    print(json.dumps(result['coverage'],indent=2))
    print(f'Wrote {args.output} ({args.output.stat().st_size:,} bytes)')


if __name__=='__main__':
    main()
