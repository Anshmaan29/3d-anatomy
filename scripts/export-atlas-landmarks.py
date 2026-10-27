#!/usr/bin/env python3
"""Export source landmark node origins into the atlas website coordinate frame.

Requires the ignored decoded Unity hierarchy and recovered source catalog. Uses
PA Transform origins, never marker mesh bounds or guessed anatomical positions.
The fixed registration matches export-atlas-web.py. No source app is modified.
"""
import argparse
import collections
import json
from pathlib import Path
import re
import numpy as np


def matrix(t):
    x,y,z,w=t['rotation']
    r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
        [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
        [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    m=np.eye(4);m[:3,:3]=r@np.diag(t['scale']);m[:3,3]=t['position']
    return m


def export(analysis:Path,catalog_path:Path,output:Path):
    read=lambda p:json.loads(p.read_text())
    decoded=analysis/'decoded';load=lambda n:read(decoded/(n+'.json'))
    gos={g['pathId']:g for g in load('gameobjects') if g['file']=='resources.assets'}
    transforms={t['pathId']:t for t in load('transforms') if t['file']=='resources.assets'}
    renderers={r['gameObject']:r for r in load('renderers') if r['file']=='resources.assets'}
    materials={m['pathId']:m for m in load('materials') if m['file']=='resources.assets'}
    labels=read(analysis/'labels/atlas-labels.json')
    structures={s['id']:s for s in read(catalog_path)['structures']}
    bycode=labels['byCode'];world_cache={};instances=collections.defaultdict(list)
    registration=np.diag([.2,.2,-.2,1.]);registration[1,3]=-1.7
    def world(t):
        key=t['pathId']
        if key not in world_cache:
            local=matrix(t)
            world_cache[key]=world(transforms[t['parent']])@local if t['parent'] else local
        return world_cache[key]
    def chain(t):
        result=[]
        while t:
            result.append(t);t=transforms.get(t['parent'])
        return result
    for t in transforms.values():
        code=gos[t['gameObject']]['name']
        if re.fullmatch(r'[A-Za-z]+_PA\d+',code):instances[code].append(t)
    # Select the identical original source surface instance as the mesh exporter.
    meshes={m['pathId']:m for m in load('meshes')}
    surface_options=collections.defaultdict(list)
    go_transforms={t['gameObject']:t for t in transforms.values()}
    for f in load('meshfilters'):
        if f['file']!='resources.assets' or f['mesh']['fileId']!=0:continue
        mesh=meshes.get(f['mesh']['pathId']);tr=go_transforms.get(f['gameObject'])
        if mesh and tr:surface_options[mesh['name']].append(tr)
    def surface_score(t,code):
        refs=renderers.get(t['gameObject'],{}).get('materials',[])
        mats=[materials.get(ref['pathId'],{}) for ref in refs]
        placeholder=not mats or all(m.get('name','Default-Material')=='Default-Material' for m in mats)
        root=gos[chain(t)[-1]['gameObject']]['name']
        return (placeholder,gos[t['gameObject']]['name']!=code,'Multicolor' in root,'Variant' in root,t['gameObject'])
    canonical={code:min(opts,key=lambda t:surface_score(t,code))['pathId'] for code,opts in surface_options.items()}
    missing=[];invalid=[];ancestry_mismatches=[];landmarks=[];unassociated=[];max_variant_distance=0.
    for pin in sorted(labels['pins'],key=lambda r:(r['prefix'],r['id'])):
        code=f"{pin['prefix']}_PA{pin['id']}";parentcode=f"{pin['prefix']}_M{pin['modelId']}"
        structureid='ATLAS_'+parentcode;options=instances.get(code,[])
        if not options:missing.append(code);continue
        def score(t):
            ancestors=chain(t);names=[gos[a['gameObject']]['name'] for a in ancestors]
            owner=next((a for a in ancestors[1:] if re.fullmatch(r'[A-Za-z]+_M\d+',gos[a['gameObject']]['name'])),None)
            refs=renderers.get(owner['gameObject'] if owner else 0,{}).get('materials',[])
            mats=[materials.get(ref['pathId'],{}) for ref in refs]
            placeholder=not mats or all(m.get('name','Default-Material')=='Default-Material' for m in mats)
            owner_code=gos[owner['gameObject']]['name'] if owner else None
            canonical_mismatch=bool(owner and canonical.get(owner_code)!=owner['pathId'])
            return (canonical_mismatch,any('multicolor' in n.lower() for n in names),placeholder,
                any('variant' in n.lower() for n in names),t['pathId'])
        selected=min(options,key=score);ancestors=chain(selected)
        ownermatch=next((gos[a['gameObject']]['name'] for a in ancestors[1:]
            if re.fullmatch(r'[A-Za-z]+_M\d+',gos[a['gameObject']]['name'])),None)
        if ownermatch and ownermatch!=parentcode:
            ancestry_mismatches.append({'code':code,'catalogParent':parentcode,'sceneParent':ownermatch})
        # Scene ancestry is authoritative when the source catalog has stale IDs.
        # Example: source skull-section pins incorrectly name a femur modelId.
        association='catalog-modelId'
        if ownermatch and 'ATLAS_'+ownermatch in structures:
            parentcode=ownermatch;structureid='ATLAS_'+parentcode;association='source-scene-ancestor'
        point=(registration@world(selected))[:3,3]
        assert np.isfinite(point).all(),code
        for option in options:
            delta=float(np.linalg.norm((registration@world(option))[:3,3]-point))
            max_variant_distance=max(max_variant_distance,delta)
        label=bycode[code]
        if structureid not in structures:
            invalid.append({'code':code,'structureId':structureid})
            unassociated.append({'id':'ATLAS_'+code,'name':pin['en_name'].strip(),'sourceCode':code,
                'point':[round(float(v),8) for v in point],'reason':'Source catalog has no valid modelId and source node has no model ancestor'})
            continue
        landmarks.append({'id':'ATLAS_'+code,'name':pin['en_name'].strip(),
            'latinName':(pin.get('latin_name') or '').strip(),'structureId':structureid,
            'point':[round(float(v),8) for v in point],'sourceCode':code,'associationBasis':association,
            'reviewStatus':'source-derived; not independently clinically reviewed'})
    assert len({x['id'] for x in landmarks})==len(landmarks)
    result={'landmarks':landmarks,'unassociatedAnchors':unassociated,
        'source':'Anatomical source catalogue','anchorType':'Source PA Transform origin',
        'registration':registration.tolist(),
        'coverage':{'sourceLandmarkRows':len(labels['pins']),'exportedLandmarks':len(landmarks),
            'missingSourceAnchors':missing,'invalidParentReferences':invalid,
            'sceneCatalogParentMismatches':ancestry_mismatches,
            'maxDuplicateInstancePositionDistance':max_variant_distance},
        'limitations':['Landmark positions and labels are recovered source data and await independent clinical review.',
            'Pin node origins are used as authored; no marker-quad centers or invented positions are substituted.',
            'Verified source scene ancestry resolves stale catalog modelIds; disagreements and unassociated anchors are explicitly retained in coverage.']}
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps({'output':str(output),'bytes':output.stat().st_size,'exported':len(landmarks),'unassociated':len(unassociated),'missingAnchors':len(missing),'sceneCatalogMismatches':len(ancestry_mismatches),'maxDuplicatePositionDistance':max_variant_distance},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--analysis',type=Path,default=Path('data-source/atlas-analysis'))
    p.add_argument('--catalog',type=Path,default=Path('public/data/atlas.json'))
    p.add_argument('--output',type=Path,default=Path('public/data/atlas-landmarks.json'))
    a=p.parse_args();export(a.analysis,a.catalog,a.output)
