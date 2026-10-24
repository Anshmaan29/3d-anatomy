#!/usr/bin/env python3
"""Rebuild Anatomy Studio's real BodyParts3D meshes from the official archive.

Python 3 standard library only. Run from the project root after downloading the
source files documented in data-source/README.md. Then run optimize-anatomy.mjs.
Only element OBJ meshes are exported, once each. Compound organs never duplicate
their constituent surfaces. Original anatomical coordinates and normals are kept
under one rigid axis transform and one uniform, shared scale.
"""
from __future__ import annotations
import array, collections, csv, hashlib, json, math, pathlib, re, struct, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data-source' / 'bodyparts3d'
OUT = ROOT / 'public' / 'data'
RAW = ROOT / 'data-source' / 'generated'
ATTRIBUTION = 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International'
SYSTEMS = ['skeletal', 'muscular', 'cardiovascular', 'nervous', 'respiratory', 'digestive', 'urinary', 'reproductive', 'lymphatic', 'endocrine']
COLORS = {'skeletal':[0.84,0.80,0.64], 'muscular':[0.59,0.13,0.14], 'cardiovascular':[0.69,0.10,0.13], 'nervous':[0.90,0.66,0.23], 'respiratory':[0.64,0.40,0.45], 'digestive':[0.57,0.32,0.26], 'urinary':[0.50,0.20,0.22], 'reproductive':[0.65,0.40,0.32], 'lymphatic':[0.25,0.51,0.36], 'endocrine':[0.69,0.40,0.21]}
OCULAR_PATTERN = re.compile(r'\b(?:iris|cornea|corneal|lens|sclera|scleral|choroid|choroidal|vitreous|eyeball|retina|retinal|conjunctiva|conjunctival|eyelid|eyelids|ciliary body|corona ciliaris|lacrimal gland)\b', re.I)

def rows(filename):
    return list(csv.DictReader((SOURCE / filename).open(), delimiter='\t'))

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024), b''): h.update(b)
    return h.hexdigest()

def load_tables():
    definitions={}; candidates=collections.defaultdict(list); names={}; reps={}
    for kind in ['partof','isa']:
        d=collections.defaultdict(set)
        for r in rows(kind+'_element_parts.txt'):
            d[r['concept id']].add(r['element file id']); names[r['concept id']]=r['name']
        definitions[kind]=d
        for r in rows(kind+'_parts_list_e.txt'):
            reps.setdefault(r['concept id'], r['representation id'])
        for concept, files in d.items():
            for f in files: candidates[f].append((len(files), kind!='partof', concept, names[concept]))
    return definitions, candidates, names, reps

def main():
    OUT.mkdir(parents=True,exist_ok=True); RAW.mkdir(parents=True,exist_ok=True)
    defs, candidates, names, reps=load_tables()
    sets=collections.defaultdict(set)
    roots=[('skeletal','isa',['FMA5018','FMA12516','FMA7591','FMA21496','FMA7646']),('skeletal','partof',['FMA23881','FMA10446']),('muscular','isa',['FMA5022']),('cardiovascular','partof',['FMA7161']),('cardiovascular','isa',['FMA86187','FMA86188']),('nervous','partof',['FMA7157','FMA12514','FMA12515']),('nervous','isa',['FMA11195','FMA67242','FMA83929']),('respiratory','partof',['FMA7158']),('digestive','partof',['FMA7152']),('urinary','partof',['FMA7159']),('reproductive','partof',['FMA7160']),('lymphatic','isa',['FMA7196']),('lymphatic','partof',['FMA9607']),('endocrine','partof',['FMA9668'])]
    for system,kind,ids in roots:
        for concept in ids:sets[system].update(defs[kind][concept])

    # Names complement the archive's incomplete compound system definitions.
    # These are browsing categories, recorded as inferred in the manifest.
    def classify(fid,name):
        n=name.lower()
        if any(t in n for t in ['artery','arteries','vein','veins','venous','arterial','aorta','vena cava','cardiac','heart','ventricle','atrium','papillary','valve','chordae','myocard','endocard','pericard','septum of heart','coronary','ventricular','deep palmar arch']):
            if not any(t in n for t in ['cerebral ventricle','ventricular system','lateral ventricle','third ventricle','fourth ventricle','neuraxis']):return 'cardiovascular'
        if any(t in n for t in ['pancrea','lobe of liver','hepatic biliary']):return 'digestive'
        if any(t in n for t in ['adrenal','thyroid gland','parathyroid','pituitary','pineal']):return 'endocrine'
        if not any(t in n for t in ['ligament','retinaculum','tendinous ring']):
            if re.search(r'\b(deltoid|pectoralis|trapezius|flexor|extensor|adductor|abductor|gastrocnemius|soleus|interossei|lumbrical|interspinales|intertransversarii|levatores|rectus|vastus|biceps|triceps|pronator|supinator|coccygeus|puborectalis|sphincter|longus colli|iliococcygeus|pubococcygeus|aryepiglotticus|cricothyroid)\b',n):return 'muscular'
        if OCULAR_PATTERN.search(n):return 'nervous'
        if any(t in n for t in ['thyroid cartilage','cricoid cartilage','arytenoid cartilage','corniculate cartilage','cuneiform cartilage','epiglottis','thyrohyoid membrane','vocal ligament','cricothyroid ligament','conus elasticus','nasal cartilage','nasal septum','alar cartilage']):return 'respiratory'
        for system in ['skeletal','muscular','cardiovascular','nervous','urinary','reproductive','endocrine','lymphatic','digestive','respiratory']:
            if fid in sets[system]:return system
        if any(t in n for t in ['thalam','gyrus','gyri','fornix','commissure','decussation','ganglion','nerve','choroid','ciliar','eyeball','eyelid','lacrimal','nasolacrimal','cornea','sclera','optic','neural','neuraxis','cerebral','brain','mening','dura mater','telencephalon','tentorium','interpeduncular']) or re.search(r'\bretin(?:a|al)\b',n):return 'nervous'
        if any(t in n for t in ['adrenal','thyroid gland','parathyroid','pituitary','pineal']):return 'endocrine'
        if any(t in n for t in ['testis','testes','penis','epididym','deferent','seminal','prostate','spongiosum','cavernosum','mons pubis','cavernous organ']):return 'reproductive'
        if any(t in n for t in ['kidney','ureter','urethra','urinary']):return 'urinary'
        if any(t in n for t in ['spleen','thymus','lymph']):return 'lymphatic'
        if any(t in n for t in ['lung','bronch','trache','laryn','arytenoid','cuneiform cartilage','corniculate cartilage','epiglott','cricoid','thyrohyoid','vocal ligament','conus elasticus','nasal cartilage','nasal septum','alar cartilage','thyroid cartilage','cricothyroid ligament']):return 'respiratory'
        if any(t in n for t in ['liver','hepato','biliary','gastric','stomach','intestin','colon','rectum','pharyn','esophag','oesophag','sublingual gland','saliv','tongue','lip','gingiva','mesenter','mesocol','peritone']) or re.search(r'\banal\b',n):return 'digestive'
        if any(t in n for t in ['bone','cartilage','vertebra','phalan','metacarp','metatars','carpal','tarsal','humerus','femur','tibia','fibula','radius','ulna','patella','calcaneus','talus','ligament','retinaculum','interosseous membrane','tendinous ring']):return 'skeletal'
        if any(t in n for t in ['deltoid','pectoralis','trapezius','flexor','extensor','adductor','abductor','gastrocnemius','soleus','interossei','lumbrical','interspinal','intertransvers','levatores','rectus','vastus','biceps','triceps','pronator','supinator','coccygeus','puborectalis','sphincter','tendon','tendinous','fascia','colliculus','longus colli','raphe','iliococcygeus','pubococcygeus','aryepiglotticus','cricothyroid','linea alba']):return 'muscular'
        return None

    archive=SOURCE/'isa_BP3D_4.0_obj_99.zip'; z=zipfile.ZipFile(archive)
    inventory=[]; omissions=[]; inferred=[]
    for member in z.namelist():
        if not member.endswith('.obj'):continue
        fid=pathlib.Path(member).stem
        with z.open(member) as f: header=''.join(f.readline().decode() for _ in range(15))
        fields={k.strip():v.strip() for k,v in re.findall(r'^# ([\w ()-]+)\s*:\s*([^\n]*)$',header,re.M)}
        concept=fields.get('Concept ID',''); name=fields.get('English name','')
        if not concept or not name:
            c=sorted(candidates[fid])[0] if candidates[fid] else None
            if c:_,_,concept,name=c;inferred.append({'element':fid,'mapping':'official element table fallback','concept':concept})
        if not concept or not name:
            omissions.append({'element':fid,'reason':'No valid official concept mapping'});continue
        n=name.lower()
        if any(t in n for t in ['anatomical compartment space','anatomical conduit space','integument','hair of head','eyebrow','external ear','pubic hair']) or n=='skin':
            omissions.append({'element':fid,'name':name,'reason':'Outer covering or space carrier omitted from internal atlas'});continue
        system=classify(fid,name)
        if not system:
            omissions.append({'element':fid,'name':name,'concept':concept,'reason':'Unreviewed system classification'});continue
        b=re.search(r'Bounds\(mm\):\s*\(([^)]+)\)-\(([^)]+)\)',header)
        if not b:raise ValueError('Missing bounds '+fid)
        bounds=[list(map(float,b.group(i).split(','))) for i in [1,2]]
        inventory.append({'file':member,'element':fid,'id':concept,'name':name,'system':system,'representationId':fields.get('Representation ID') or reps.get(concept),'sourceBounds':bounds})
    allmin=[min(x['sourceBounds'][0][k] for x in inventory) for k in range(3)]
    allmax=[max(x['sourceBounds'][1][k] for x in inventory) for k in range(3)]
    center=[(a+b)/2 for a,b in zip(allmin,allmax)];scale=3.5/(allmax[2]-allmin[2])
    def pos(v):return [(v[0]-center[0])*scale,(v[2]-center[2])*scale,-(v[1]-center[1])*scale]
    def normal(v):return [v[0],v[2],-v[1]]
    groups=collections.defaultdict(list)
    for item in inventory:groups[item['id']].append(item)
    structures=[]; system_rows=[]
    for system in SYSTEMS:
        doc={'asset':{'version':'2.0','generator':'Anatomy Studio official BodyParts3D ingestion','copyright':ATTRIBUTION},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'accessors':[],'bufferViews':[],'buffers':[]}
        binary=bytearray();materials={};triangles=0;vertices=0
        def view(data,target):
            while len(binary)%4:binary.append(0)
            idx=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data),'target':target});binary.extend(data);return idx
        def accessor(data,component,type_,count,target,min_=None,max_=None):
            idx=len(doc['accessors']);a={'bufferView':view(data,target),'componentType':component,'count':count,'type':type_}
            if min_ is not None:a.update(min=min_,max=max_)
            doc['accessors'].append(a);return idx
        for concept,items in sorted(groups.items()):
            # Exact source concept grouping; no copied compound surfaces.
            if items[0]['system']!=system:continue
            positions=array.array('f');normals=array.array('f');indices=array.array('I');source_elements=[]
            for item in items:
                text=z.read(item['file']).decode();pv=[];nv=[];faces=[]
                for line in text.splitlines():
                    if line.startswith('v '):pv.append(list(map(float,line.split()[1:4])))
                    elif line.startswith('vn '):nv.append(list(map(float,line.split()[1:4])))
                    elif line.startswith('f '):faces.append(line.split()[1:])
                if not nv:
                    nv=[[0.0,0.0,0.0] for _ in pv]
                    for face in faces:
                        ids=[int(c.split('/')[0])-1 for c in face]
                        for j in range(1,len(ids)-1):
                            a,b,c=(pv[k] for k in [ids[0],ids[j],ids[j+1]])
                            u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)]
                            cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
                            for vi in [ids[0],ids[j],ids[j+1]]:
                                for k in range(3):nv[vi][k]+=cross[k]
                    for v in nv:
                        length=math.sqrt(sum(x*x for x in v))
                        if length:
                            for k in range(3):v[k]/=length
                # Keep original smooth normals and shared indices. A few source
                # files use separate normal indices, so map full corner tuples.
                remap={}
                for face in faces:
                    corners=[]
                    for corner in face:
                        values=corner.split('/');vi=int(values[0])-1;ni=int(values[2])-1 if len(values)>2 and values[2] else vi
                        key=(vi,ni)
                        if key not in remap:
                            if ni>=len(nv):raise ValueError('Invalid source normal index '+item['element'])
                            remap[key]=len(positions)//3;positions.extend(pos(pv[vi]));normals.extend(normal(nv[ni]))
                        corners.append(remap[key])
                    for i in range(1,len(corners)-1):indices.extend([corners[0],corners[i],corners[i+1]])
                source_elements.append(item['element'])
            lo=[min(positions[k::3]) for k in range(3)];hi=[max(positions[k::3]) for k in range(3)]
            p=accessor(positions.tobytes(),5126,'VEC3',len(positions)//3,34962,lo,hi)
            n=accessor(normals.tobytes(),5126,'VEC3',len(normals)//3,34962)
            if len(positions)//3<65536:idx=array.array('H',indices);component=5123
            else:idx=indices;component=5125
            i=accessor(idx.tobytes(),component,'SCALAR',len(indices),34963)
            name=items[0]['name']; color=COLORS[system]
            if system=='cardiovascular' and any(t in name.lower() for t in ['vein','venous','vena cava','coronary sinus']):color=[0.18,0.30,0.59]
            matkey=tuple(color)
            if matkey not in materials:
                materials[matkey]=len(doc['materials']);doc['materials'].append({'name':system+str(len(materials)),'pbrMetallicRoughness':{'baseColorFactor':color+[1],'metallicFactor':0,'roughnessFactor':0.58},'doubleSided':True})
            mesh=len(doc['meshes']);doc['meshes'].append({'name':concept,'primitives':[{'attributes':{'POSITION':p,'NORMAL':n},'indices':i,'material':materials[matkey]}]})
            node=len(doc['nodes']);doc['nodes'].append({'name':concept,'mesh':mesh,'extras':{'source':'BodyParts3D 4.0','sourceId':concept,'elementIds':source_elements}});doc['scenes'][0]['nodes'].append(node)
            mid=[(a+b)/2 for a,b in zip(lo,hi)];sy=(mid[1]+1.75)/3.5
            if sy>.82:region='Head & neck'
            elif abs(mid[0])>.28 and .37<sy<.81:region='Upper limb'
            elif sy>.64:region='Thorax'
            elif sy>.51:region='Abdomen'
            elif sy>.42:region='Pelvis'
            else:region='Lower limb'
            lower=name.lower()
            if OCULAR_PATTERN.search(lower):region='Head & neck'
            elif re.search(r'lumbar vertebra|intervertebral disk.*lumbar|intervertebral disc.*lumbar',lower):region='Abdomen'
            elif re.search(r'clavicle|scapula|humerus|\bulna\b|\bradius\b|carpal|carpi|metacarp|finger|thumb|\bhand\b|wrist|brachii|pollicis|pronator|supinator|deltoid',lower):region='Upper limb'
            elif re.search(r'hip bone|sacrum|coccyx|sacral|pelvic|prostate|testis|penis|seminal|deferent|epididym|bladder|urethra|pubic|pubococcygeus|puborectalis|iliococcygeus|\brectum\b|\banal\b',lower):region='Pelvis'
            elif re.search(r'femur|femoris|tibia|fibula|patella|calcaneus|\btalus\b|\btarsal|metatars|\btoe\b|\bfoot\b|hallucis|gastrocnemius|soleus|\bknee\b|ankle',lower):region='Lower limb'
            elif re.search(r'thoracic vertebra|sternum|\brib\b|costal cartilage|\blung\b|bronch|trachea',lower) or (system=='cardiovascular' and re.search(r'heart|atrium|ventricle|cardiac|coronary',lower)):region='Thorax'
            elif re.search(r'liver|hepatic|gallbladder|kidney|ureter|pancrea|stomach|\bcolon\b|intestin|jejun|ileum|duodenum|adrenal',lower):region='Abdomen'
            laterality='left' if 'left' in lower and 'right' not in lower else ('right' if 'right' in lower and 'left' not in lower else 'midline / bilateral')
            structures.append({'id':concept,'name':name,'system':system,'region':region,'laterality':laterality,'source':'BodyParts3D','sourceId':concept,'representationId':items[0]['representationId'],'elementIds':source_elements,'bounds':[[round(v,6) for v in lo],[round(v,6) for v in hi]],'center':[round(v,6) for v in mid],'synonyms':[name.lower(),concept],'reviewStatus':'source-labelled; clinical review pending'})
            vertices+=len(positions)//3;triangles+=len(indices)//3
        doc['buffers']=[{'byteLength':len(binary)}];jsondata=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();jsondata+=b' '*((-len(jsondata))%4);binary+=b'\0'*((-len(binary))%4)
        glb=struct.pack('<4sII',b'glTF',2,12+8+len(jsondata)+8+len(binary))+struct.pack('<II',len(jsondata),0x4e4f534a)+jsondata+struct.pack('<II',len(binary),0x004e4942)+binary
        path=RAW/(system+'.glb');path.write_bytes(glb)
        row={'id':system,'path':'/models/'+system+'.glb','count':len(doc['nodes']),'elements':sum(len(x['extras']['elementIds']) for x in doc['nodes']),'vertices':vertices,'triangles':triangles,'rawBytes':len(glb)};system_rows.append(row);print(json.dumps(row),flush=True)
    fixtures=[('Flexor retinaculum of right wrist','skeletal','Upper limb'),('Flexor retinaculum of left wrist','skeletal','Upper limb'),('Tarsal plate of right lower eyelid','nervous','Head & neck'),('Tarsal plate of left lower eyelid','nervous','Head & neck'),('Tarsal plate of right upper eyelid','nervous','Head & neck'),('Tarsal plate of left upper eyelid','nervous','Head & neck')]
    byname={s['name']:s for s in structures}
    for name,system,region in fixtures:
        actual=byname.get(name)
        if not actual or (actual['system'],actual['region'])!=(system,region):raise ValueError('Anatomical classification regression: '+name)
    for s in structures:
        if re.search(r'\bretinaculum\b',s['name'],re.I) and s['system']!='skeletal':raise ValueError('Retinaculum misclassified: '+s['name'])
    (RAW/'classification-regressions.json').write_text(json.dumps({'passed':len(fixtures),'fixtures':[{'name':n,'system':s,'region':r} for n,s,r in fixtures],'retinaculumAudit':'all source retinacula skeletal'},indent=2))
    metadata={'version':'bp3d-4.0-2026-10-24','source':'BodyParts3D 4.0','attribution':ATTRIBUTION,'license':'CC-BY-4.0','systems':system_rows,'bounds':[[-(allmax[0]-allmin[0])*scale/2,-1.75,-(allmax[1]-allmin[1])*scale/2],[(allmax[0]-allmin[0])*scale/2,1.75,(allmax[1]-allmin[1])*scale/2]],'transform':{'sourceUnit':'mm','rotation':'(x,y,z) -> (x,z,-y)','sourceCenter':center,'scale':scale,'patientRight':'-X','anterior':'+Z'},'structures':structures}
    (OUT/'anatomy.json').write_text(json.dumps(metadata,separators=(',',':'),ensure_ascii=False))
    manifest={'source':'BodyParts3D','version':'4.0','downloaded':'2026-10-24','sourceUrl':'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html','licenseUrl':'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html','license':'CC-BY-4.0','licensePageUpdated':'2025-02-27','attribution':ATTRIBUTION,'legacyEmbeddedNotice':'2013 OBJ comments retain CC Attribution-Share Alike 2.1 Japan; the current authoritative archive license grants CC BY 4.0. Both notices are preserved in source files.','modifications':'Axis rotation, common centering and uniform scale, grouping source elements by source FMA concept; PBR colors; glTF meshopt compression and quantization. No further polygon decimation.','sourceFiles':[{'file':p.name,'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(SOURCE.iterdir()) if p.is_file() and not p.name.endswith('.tmp') and '.complete.' not in p.name],'sourceObjCount':len([n for n in z.namelist() if n.endswith('.obj')]),'includedElements':len(inventory),'selectableStructures':len(structures),'omissions':omissions,'fallbackMappings':inferred,'systems':system_rows,'limits':['Single adult male-derived dataset; female reproductive anatomy absent.','System browsing categories and spatial regions include software inference and need qualified review.','Reduced-resolution source meshes; smooth normals do not restore missing detail.','Source labels preserved; no claim of clinical or curriculum review.','No histology, pathology, microanatomy, embryology or cadaver textures.']}
    (OUT/'licenses.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False));(RAW/'inventory.json').write_text(json.dumps(inventory,indent=2));print('DONE',len(structures),'structures',len(inventory),'elements',len(omissions),'omissions',flush=True)

if __name__=='__main__':main()
