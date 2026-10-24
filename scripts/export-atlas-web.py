#!/usr/bin/env python3
"""Convert recovered Unity arrays/hierarchies/materials to web glTF.

Requires source-owner permission, numpy and Pillow. Run the independent extraction
scripts first. No source code, decrypting material, UI images or font assets are
included in the public output. Anatomical labels are never guessed from shape.
"""
import argparse
import collections
import hashlib
import json
import math
import pathlib
import re
import struct

import numpy as np
from PIL import Image

SYSTEMS = {'Ske':'skeletal','Lig':'skeletal','Mus':'muscular','Int':'muscular',
    'Art':'cardiovascular','Vei':'cardiovascular','Hea':'cardiovascular',
    'Ner':'nervous','Bra':'nervous','Eye':'nervous','Ear':'nervous','Res':'respiratory',
    'Dig':'digestive','Uro':'reproductive','Lym':'lymphatic','End':'endocrine'}


def read(path):
    return json.loads(path.read_text())


def matrix(t):
    x,y,z,w = t['rotation']
    r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
        [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
        [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
    m=np.eye(4);m[:3,:3]=r@np.diag(t['scale']);m[:3,3]=t['position']
    return m


class GLB:
    def __init__(self):
        self.doc={'asset':{'version':'2.0','generator':'Anatomy Studio authorized Unity adaptation'},
            'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'accessors':[],
            'bufferViews':[],'buffers':[{}],'materials':[],'images':[],'textures':[],
            'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]}
        self.binary=bytearray();self.material_keys={};self.texture_keys={}

    def accessor(self, values, kind, component=5126):
        values=np.asarray(values,dtype='<u4' if component==5125 else '<f4')
        payload=values.tobytes();offset=len(self.binary)
        self.binary.extend(payload);self.binary.extend(b'\0'*((-len(self.binary))%4))
        view=len(self.doc['bufferViews']);self.doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(payload)})
        accessor={'bufferView':view,'componentType':component,'count':len(values),'type':kind}
        if kind=='VEC3':accessor.update(min=values.min(axis=0).tolist(),max=values.max(axis=0).tolist())
        index=len(self.doc['accessors']);self.doc['accessors'].append(accessor);return index

    def texture(self, uri):
        if uri not in self.texture_keys:
            i=len(self.doc['images']);self.doc['images'].append({'uri':uri})
            index=len(self.doc['textures']);self.doc['textures'].append({'source':i,'sampler':0});self.texture_keys[uri]=index
        return self.texture_keys[uri]

    def save(self, path):
        self.doc['buffers'][0]['byteLength']=len(self.binary)
        meta=json.dumps(self.doc,separators=(',',':')).encode();meta+=b' '*((-len(meta))%4)
        total=12+8+len(meta)+8+len(self.binary)
        path.write_bytes(struct.pack('<III',0x46546c67,2,total)+struct.pack('<II',len(meta),0x4e4f534a)+meta+struct.pack('<II',len(self.binary),0x004e4942)+self.binary)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--analysis',type=pathlib.Path,default=pathlib.Path('data-source/atlas-analysis'))
    p.add_argument('--public',type=pathlib.Path,default=pathlib.Path('public'))
    args=p.parse_args();base=args.analysis;decoded=base/'decoded';web=args.public/'models/atlas';raw=base/'web-raw'
    for folder in [web,web/'textures',web/'balanced',web/'balanced/textures',raw]:folder.mkdir(parents=True,exist_ok=True)
    load=lambda n:read(decoded/f'{n}.json')
    meshlist=load('meshes');meshes={m['pathId']:m for m in meshlist}
    gos={g['pathId']:g for g in load('gameobjects') if g['file']=='resources.assets'}
    trs={t['pathId']:t for t in load('transforms') if t['file']=='resources.assets'}
    go_trs={t['gameObject']:t for t in trs.values()}
    renderers={r['gameObject']:r for r in load('renderers') if r['file']=='resources.assets'}
    materials={m['pathId']:m for m in load('materials') if m['file']=='resources.assets'}
    texturelist=read(base/'textures/textures.json');textures={(t['file'],t['pathId']):t for t in texturelist}
    labels_path=base/'labels/atlas-labels.json'
    labeldata=read(labels_path) if labels_path.exists() else {'byCode':{}}
    labels=labeldata['byCode'];regions={r['id']:r['en_name'] for r in labeldata.get('regions',[])};world_cache={};texture_cache={};texture_manifest=[]
    def world(t):
        if t['pathId'] not in world_cache:
            local=matrix(t);world_cache[t['pathId']]=world(trs[t['parent']])@local if t['parent'] else local
        return world_cache[t['pathId']]
    def chain(t):
        result=[]
        while t:
            result.append(gos[t['gameObject']]['name']);t=trs.get(t['parent'])
        return result
    # Retain one source instance per mesh, selecting the original named object.
    instances=collections.defaultdict(list)
    for f in load('meshfilters'):
        if f['file']!='resources.assets' or f['mesh']['fileId']!=0:continue
        m=meshes.get(f['mesh']['pathId']);t=go_trs.get(f['gameObject'])
        if not m or not t:continue
        if not re.match(r'^[A-Za-z]+_M',m['name']) and not m['name'].startswith(('Ventricle','Atrium','Atrio')):continue
        names=chain(t);instances[m['pathId']].append({'mesh':m,'transform':world(t),'goId':f['gameObject'],'chain':names})
    selected=[]
    for path_id,options in instances.items():
        def instance_score(item):
            refs=renderers.get(item['goId'],{}).get('materials',[])
            mats=[materials.get(ref['pathId'],{}) for ref in refs]
            placeholder=not mats or all(m.get('name','Default-Material')=='Default-Material' for m in mats)
            return (placeholder,gos[item['goId']]['name']!=item['mesh']['name'],'Multicolor' in item['chain'][-1],'Variant' in item['chain'][-1],item['goId'])
        item=sorted(options,key=instance_score)[0]
        item['root']=item['chain'][-1];selected.append(item)
    # Native original body spans ~18 units. Use a fixed shared transform; never
    # independently center organs, which would destroy their spatial relations.
    registration=np.diag([.2,.2,-.2,1.]);registration[1,3]=-1.7
    def export_texture(ref, slot, quality):
        key=(ref['pathId'],slot,quality)
        if key in texture_cache:return texture_cache[key]
        source=textures.get(('resources.assets',ref['pathId']))
        if not source:return None
        image=Image.open(base/'textures'/source['png']).convert('RGBA')
        limit=2048 if quality=='high' else 1024
        image.thumbnail((limit,limit),Image.Resampling.LANCZOS)
        if slot=='normal':
            rgba=np.asarray(image,dtype=np.float32)/255
            x=rgba[:,:,3]*2-1;y=rgba[:,:,1]*2-1
            z=np.sqrt(np.maximum(0,1-x*x-y*y))
            rgb=np.stack([x*.5+.5,-y*.5+.5,z*.5+.5],axis=2)
            image=Image.fromarray(np.uint8(np.clip(rgb*255,0,255)))
        else:image=image.convert('RGB')
        # Content address texture paths to make immutable browser/CDN caches safe.
        import io
        stream=io.BytesIO();image.save(stream,format='JPEG',quality=93 if quality=='high' else 86,subsampling=0,optimize=True)
        payload=stream.getvalue();name=hashlib.sha256(payload).hexdigest()[:20]+'.jpg'
        dest=(web if quality=='high' else web/'balanced')/'textures'/name
        if not dest.exists():dest.write_bytes(payload)
        uri='textures/'+name;texture_cache[key]=uri
        texture_manifest.append({'sourceTexture':source['name'],'sourcePathId':source['pathId'],'slot':slot,'quality':quality,'path':str(dest.relative_to(args.public)),'bytes':len(payload),'dimensions':list(image.size)})
        return uri
    def material(doc,ref,quality):
        path_id=ref['pathId'] if ref and ref['fileId']==0 else 0
        if path_id in doc.material_keys:return doc.material_keys[path_id]
        source=materials.get(path_id);props=source or {};floats=props.get('floats',{});tex=props.get('textures',{});color=props.get('colors',{}).get('_Color',[.7,.45,.4,1])
        # Unity Standard albedo colors are already supplied as material factors.
        pbr={'baseColorFactor':color,'metallicFactor':0,'roughnessFactor':max(.35,1-floats.get('_Glossiness',.4))}
        mat={'name':props.get('name','Source material'),'pbrMetallicRoughness':pbr,'doubleSided':True}
        for slot,source_slot in [('color','_MainTex'),('normal','_BumpMap')]:
            value=tex.get(source_slot)
            if not value or not value['pathId']:continue
            uri=export_texture(value,slot,quality)
            if uri:
                entry={'index':doc.texture(uri)}
                if slot=='color':pbr['baseColorTexture']=entry
                else:mat['normalTexture']=dict(entry,scale=floats.get('_BumpScale',1))
        index=len(doc.doc['materials']);doc.doc['materials'].append(mat);doc.material_keys[path_id]=index;return index
    structures=[];systems=[];unmapped=[]
    batches=collections.defaultdict(list)
    for item in selected:
        code=item['mesh']['name'];label=labels.get(code,{})
        if not label:
            label=next((labels[n] for n in item['chain'] if n in labels and labels[n].get('kind')=='surface'),{})
            if label:label=dict(label,name=label['name']+' · internal surface')
        prefix=code.split('_')[0];system=label.get('system') or SYSTEMS.get(prefix,'cardiovascular')
        # Labels script may use source table aliases; stable app system IDs only.
        if system not in set(SYSTEMS.values())|{'urinary'}:system=SYSTEMS.get(prefix,'cardiovascular')
        if prefix=='Uro' and re.search(r'kidney|renal|ureter|urethra|urinary|bladder',label.get('name',''),re.I):system='urinary'
        item['system']=system;item['label']=label;batches[system].append(item)
    for system,items in sorted(batches.items()):
        for chunk_start in range(0,len(items),100):
            chunk=items[chunk_start:chunk_start+100];basename=f'{system}-{chunk_start//100+1:02}.glb'
            for quality in ['high','balanced']:
                doc=GLB()
                for item in chunk:
                    meta=item['mesh'];code=meta['name'];label=item['label'];id='ATLAS_'+code
                    geo=np.load(decoded/'geometry'/meta['geometry']);transform=registration@item['transform']
                    pos=geo['positions']@transform[:3,:3].T+transform[:3,3]
                    normals=geo['normals']@np.linalg.inv(transform[:3,:3])
                    normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-12)
                    uv=geo['uv'].copy()
                    if len(uv):uv[:,1]=1-uv[:,1]
                    indices=geo['indices'].copy().reshape(-1,3)
                    if np.linalg.det(transform[:3,:3])<0:indices=indices[:,[0,2,1]]
                    indices=indices.flatten();attributes={'POSITION':doc.accessor(pos,'VEC3'),'NORMAL':doc.accessor(normals,'VEC3')}
                    if len(uv)==len(pos):attributes['TEXCOORD_0']=doc.accessor(uv[:,:2],'VEC2')
                    renderer=renderers.get(item['goId'],{});mats=renderer.get('materials',[]);offsets=meta['submeshIndexOffsets'];primitives=[]
                    for k in range(len(offsets)-1):
                        if offsets[k]==offsets[k+1]:continue
                        primitives.append({'attributes':attributes,'indices':doc.accessor(indices[offsets[k]:offsets[k+1]],'SCALAR',5125),'material':material(doc,mats[min(k,len(mats)-1)] if mats else None,quality)})
                    mesh_index=len(doc.doc['meshes']);doc.doc['meshes'].append({'name':id,'primitives':primitives})
                    node_index=len(doc.doc['nodes']);doc.doc['nodes'].append({'name':id,'mesh':mesh_index,'extras':{'sourceCode':code,'sourceGroup':item['root']}});doc.doc['scenes'][0]['nodes'].append(node_index)
                    if quality=='high':
                        variant='_MH' in code or bool(re.search('section|_sez|hidden|multicolor',item['root'],re.I)) or code.startswith(('Ventricle','Atrium','Atrio'))
                        name=label.get('name') or f'{prefix} structure · {code}'
                        if not label.get('name'):unmapped.append(code)
                        if '_MH' in code:name+=' (alternate surface)'
                        details=label.get('details') or {}
                        region=regions.get(label.get('regionId'),'Whole body')
                        root_name=item['root'].lower()
                        if re.search(r'upper|hand|shoulder|elbow',root_name):region='Upper Limb'
                        elif re.search(r'lower|foot|femur|tibia|coxo',root_name):region='Lower Limb'
                        elif re.search(r'cran|head|mandible|dental|brain|emisphere|eye|ear|hyoid',root_name):region='Head'
                        elif re.search(r'trunk|chest|thorac|abdom|pelvi|uro_|heart|lumbar|sacrum|iliac',root_name):region='Trunk'
                        latin=label.get('latinName') or ''
                        quality_notes=[]
                        if (re.search(r'\bleft\b',name,re.I) and re.search('dextr',latin,re.I)) or (re.search(r'\bright\b',name,re.I) and re.search('sinistr',latin,re.I)):
                            quality_notes.append('Source English and Latin laterality conflict; Latin label withheld pending anatomy review.')
                            latin=''
                        if label.get('sourceType')=='model' and re.search(r'female|section|\bsez\b',root_name,re.I):variant=True
                        structures.append({'id':id,'name':name,'system':system,'region':region,'sourceCode':code,'sourceId':str(label.get('id',code)),'source':'Anatomy 3D Atlas 7.2','sourceLicense':'Reuse permission confirmed by project owner','reviewStatus':('source-derived; not independently clinically reviewed'+(' · Source English/Latin laterality conflict; Latin withheld' if quality_notes else '')) if label.get('name') else 'unresolved English label','assetPath':'/models/atlas/'+basename,'balancedAssetPath':'/models/atlas/balanced/'+basename,'bounds':[pos.min(axis=0).tolist(),pos.max(axis=0).tolist()],'latinName':latin,'dataQualityNotes':quality_notes,'groupName':label.get('groupName') or item['root'],'layer':label.get('layer'),'details':details,'variant':variant,'defaultHidden':variant,'synonyms':[code,label.get('latinName',''),label.get('groupName','')]})
                out=raw/(('balanced-' if quality=='balanced' else '')+basename);doc.save(out)
                systems.append({'id':system,'quality':quality,'file':basename,'rawPath':str(out),'outputPath':str((web/'balanced' if quality=='balanced' else web)/basename),'nodes':len(chunk)})
                print(system,basename,quality,len(chunk),'nodes',out.stat().st_size,'raw bytes',flush=True)
    catalog={'version':'atlas-7.2-adaptation-2026-10-24','source':'Anatomy 3D Atlas 7.2','permissionBasis':'Project owner explicitly confirmed permission to extract and reuse on 2026-10-24; no independent licence verification claimed.','structures':structures,'systems':systems,'unmappedCodes':unmapped,'registration':registration.tolist(),'limitations':['Source medical content and geometry have not been independently clinically reviewed.','Alternative surfaces and sections are initially hidden and can be selected in the library.','Unity Standard material approximated with glTF PBR; original detail/specular shaders not reproduced.']}
    (args.public/'data/atlas.json').write_text(json.dumps(catalog,separators=(',',':')))
    (base/'web-export.json').write_text(json.dumps({'structures':len(structures),'mapped':len(structures)-len(unmapped),'unmappedCodes':unmapped,'systems':systems,'textures':texture_manifest},indent=2))
    print('EXPORT',len(structures),'surfaces;',len(unmapped),'unmapped;',sum(t['bytes'] for t in texture_manifest),'web texture bytes')


if __name__=='__main__':main()
