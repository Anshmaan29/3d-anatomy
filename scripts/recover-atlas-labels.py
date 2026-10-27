#!/usr/bin/env python3
"""Recover the permitted local Atlas 7.2 catalog using its shipped decoding path.

Read-only toward the source app. Recovered material goes to the ignored local
analysis directory. No target execution, entitlement changes, or network access.
Requires pycryptodome and capstone in the project analysis venv. Embedded
asset-decoding material is resolved in memory and is never logged/exported.
This is version-specific and validates source method identities and payload.
"""
from __future__ import annotations
import argparse
import bisect
import collections
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import struct
import subprocess
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
from capstone import Cs, CS_ARCH_ARM64, CS_MODE_ARM

SECTIONS = ("stringLiteral stringLiteralData string events properties methods "
    "parameterDefaultValues fieldDefaultValues fieldAndParameterDefaultValueData "
    "fieldMarshaledSizes parameters fields genericParameters genericParameterConstraints "
    "genericContainers nestedTypes interfaces vtableMethods interfaceOffsets typeDefinitions "
    "images assemblies fieldRefs referencedAssemblies attributeData attributeDataRange "
    "unresolvedVirtualCallParameterTypes unresolvedVirtualCallParameterRanges "
    "windowsRuntimeTypeNames windowsRuntimeStrings exportedTypeDefinitions").split()
SYSTEMS = {'Ske':'bones','Mus':'muscles','Art':'arteries','Vei':'veins','Ner':'nerves',
    'Lig':'ligaments','Res':'respiratory','Dig':'digestive','Uro':'urogenital',
    'End':'endocrine','Lym':'lymphatic','Hea':'heart','Bra':'brain','Eye':'eye',
    'Ear':'ear','Int':'integumentary'}
SOURCE = {'name':'Anatomical source catalogue','version':'7.2','reviewStatus':'Source-derived; not independently clinically reviewed',
    'reuseBasis':'User explicitly confirms permission to extract and reuse in this project (2026-10-24)'}

def sha(b): return hashlib.sha256(b).hexdigest()

def decode(app:Path):
    data = app/'Contents/Resources/Data'
    meta=(data/'il2cpp_data/Metadata/global-metadata.dat').read_bytes()
    assert struct.unpack_from('<II',meta)==(0xFAB11BAF,39)
    sections={n:dict(zip(('offset','size','count'),struct.unpack_from('<III',meta,8+i*12))) for i,n in enumerate(SECTIONS)}
    def string(i):
        pos=sections['string']['offset']+i
        return meta[pos:meta.index(b'\0',pos)].decode('utf8')
    native=app/'Contents/Frameworks/GameAssembly.dylib'; binary=native.read_bytes()
    original_sha=sha(binary)
    assert binary[:4]==b'\xca\xfe\xba\xbe'
    for i in range(struct.unpack_from('>I',binary,4)[0]):
        cpu,sub,off,size,align=struct.unpack_from('>IIIII',binary,8+i*20)
        if cpu==0x100000c:
            binary=binary[off:off+size];break
    else:raise ValueError('ARM64 slice missing')
    # Map virtual addresses to their file-backed segments in the ARM64 slice.
    ncmds=struct.unpack_from('<I',binary,16)[0];pos=32;segments=[]
    for _ in range(ncmds):
        cmd,size=struct.unpack_from('<II',binary,pos)
        if cmd==0x19:
            vmaddr,vmsize,fileoff,filesize=struct.unpack_from('<QQQQ',binary,pos+24)
            segments.append((vmaddr,filesize,fileoff))
        pos+=size
    def read_vm(addr,size):
        for vmaddr,filesize,fileoff in segments:
            if vmaddr <= addr and addr+size <= vmaddr+filesize:
                return binary[fileoff+addr-vmaddr:fileoff+addr-vmaddr+size]
        raise ValueError('Address outside file-backed segments')
    symbols={}
    for line in subprocess.check_output(['nm','-arch','arm64',str(native)],text=True).splitlines():
        tokens=line.split()
        if len(tokens)==3:
            try:symbols[int(tokens[0],16)]=tokens[2]
            except ValueError:pass
    ordered=sorted(symbols)
    def address(fragment):return next(a for a,s in symbols.items() if fragment in s)
    def instructions(fragment):
        start=address(fragment);end=ordered[bisect.bisect_right(ordered,start)]
        return list(Cs(CS_ARCH_ARM64,CS_MODE_ARM).disasm(read_vm(start,end-start),start))
    inst=instructions('DecryptorToMem_FromMemToString_m')
    calls=[symbols.get(int(i.op_str[1:],16),'') for i in inst if i.mnemonic=='bl' and i.op_str.startswith('#0x')]
    assert any('AesCryptoServiceProvider__ctor' in s for s in calls)
    assert any('DeObfuscator_Run' in s for s in calls)
    # Resolve field loaded for the observed 32-byte RuntimeHelpers.InitializeArray.
    regs={};field_addr=None
    for i in inst:
        if i.mnemonic=='adrp':
            r,v=i.op_str.split(', ');regs[r]=int(v[1:],16)
        elif i.mnemonic=='add':
            match=re.fullmatch(r'(x\d+), (x\d+), #(0x[0-9a-f]+|\d+)',i.op_str)
            if match and match[2] in regs:regs[match[1]]=regs[match[2]]+int(match[3],0)
        elif i.mnemonic=='ldr' and i.op_str.startswith('x1, ['):
            r=i.op_str[5:].strip('[]')
            if r in regs and 'FieldInfo_var' in symbols.get(regs[r],''):
                field_addr=regs[r];break
    assert field_addr is not None
    field_symbol=symbols[field_addr]
    field_name=re.search(r'____([0-9A-F]{64})_FieldInfo_var$',field_symbol)[1]
    fsec=sections['fields'];fidx=next(i for i in range(fsec['count']) if string(struct.unpack_from('<I',meta,fsec['offset']+i*10)[0])==field_name)
    ds=sections['fieldDefaultValues'];dindex=None
    for i in range(ds['count']):
        fi,ti,di=struct.unpack_from('<IHI',meta,ds['offset']+i*10)
        if fi==fidx:dindex=di;break
    assert dindex is not None
    raw=meta[sections['fieldAndParameterDefaultValueData']['offset']+dindex:][:32]
    lam=instructions('U3CU3Ec_U3CRunU3Eb__0_0_m7F8FDB')
    assert [i.mnemonic for i in lam]==['eor','and','ret']
    key=bytes(v^i for i,v in enumerate(raw))
    catalogs=list((data/'StreamingAssets').glob('*.casdb'))
    if len(catalogs) != 1:
        raise ValueError('Expected exactly one source catalogue in StreamingAssets')
    enc=catalogs[0].read_bytes()
    dec=unpad(AES.new(key,AES.MODE_CBC,enc[:16]).decrypt(enc[16:]),16)
    sql=dec.decode('utf8')
    assert sql.startswith('BEGIN TRANSACTION;') and 'CREATE TABLE' in sql
    return sql,{'evidenceKind':'Offline native disassembly + source-bound metadata + validated SQL parsing',
        'nativeSha256':original_sha,'metadataSha256':sha(meta),'encryptedCatalogSha256':sha(enc),
        'decodedCatalogSha256':sha(dec),'decodedCatalogBytes':len(dec),
        'nativeMethods':{name:hex(address(name)) for name in ['CASSQLiteMonoDb_LoadCryptoDb_m','DecryptorToMem_FromMemToString_m','DeObfuscator_Run_m','AnatomyAbstract_GetIdFromName_m']},
        'decoding':'AES-CBC; IV prefix; embedded field array transformed by index XOR. No key material exported.',
        'mapping':'AnatomyAbstract.GetIdFromName splits scene name at underscore and parses digits from second token; M and MH therefore share the same numeric catalog identifier.'}

def recover(app:Path,output:Path,mesh_inventory:Path):
    sql,evidence=decode(app)
    output.mkdir(parents=True,exist_ok=True)
    (output/'catalog.sql').write_text(sql)
    db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row;db.executescript(sql)
    tables={row[0]:[dict(r) for r in db.execute('SELECT * FROM "'+row[0]+'"')] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name!='sqlite_sequence'")}
    backup=sqlite3.connect(output/'catalog.sqlite');db.backup(backup);backup.close()
    groups={r['id']:r for r in tables['groups']};scenes={r['id']:r for r in tables['scenes']}
    details={r['muscles_id']:r for r in tables['models_muscles_details'] if r['isocode']=='en'}
    rows={};pins={}
    for prefix,system in SYSTEMS.items():
        for r in tables.get('models_'+system,[]):rows[(prefix,r['id'])]=r
        for r in tables.get('pins_'+system,[]):pins[(prefix,r['id'])]=r
    meshes=json.loads(mesh_inventory.read_text())
    bycode={};unmapped=[];counts=collections.Counter()
    for mesh in meshes:
        code=mesh['name'];match=re.fullmatch(r'([A-Za-z]+)_(MH|M|PA|P)(\d+)',code)
        if not match:unmapped.append(code);continue
        prefix,kind,num=match.groups();num=int(num);is_pin=kind in ('PA','P')
        row=(pins if is_pin else rows).get((prefix,num))
        if row is None:unmapped.append(code);continue
        system=SYSTEMS[prefix];group=groups.get(row.get('group_id'),{})
        scene=scenes.get(row.get('pref_scene'),{})
        entry={'id':num,'code':code,'name':row['en_name'].strip(),'latinName':(row.get('latin_name') or '').strip(),
            'system':system,'table':('pins_' if is_pin else 'models_')+system,
            'kind':'landmark' if is_pin else 'surface','variant':kind,
            'groupId':row.get('group_id'),'groupName':group.get('en_name'),
            'prefScene':row.get('pref_scene'),'prefSceneName':scene.get('en_name'),
            'regionId':scene.get('region_id'),'prefView':row.get('pref_view'),
            'layer':row.get('layer'),'sourceType':row.get('type'),'searchable':row.get('search'),
            'source':SOURCE['name']+' '+SOURCE['version'],'reviewStatus':SOURCE['reviewStatus'],
            'translations':{k[:-5]:v for k,v in row.items() if k.endswith('_name') and v},
            'sourceRow':row}
        if is_pin:
            entry['modelId']=row['modelId'];entry['isolatedOnly']=row.get('isolatedOnly')
        if system=='muscles' and not is_pin:
            d=details.get(num,{})
            entry['details']={key:(d.get(dbkey) or row.get(legacy) or '').strip() for key,dbkey,legacy in [
                ('origin','origin','origin_en'),('insertion','insertion','insertion_en'),
                ('innervation','innervation','innervation_en'),('bloodSupply','bloodsupply','bloodSupply_en'),
                ('action','action','action_en')]}
        bycode[code]=entry;counts[entry['kind']]+=1
    summary={'tables':{k:len(v) for k,v in tables.items()},'modelRows':len(rows),'pinRows':len(pins),
        'meshCount':len(meshes),'mappedMeshCodes':len(bycode),'mappedKindCounts':dict(counts),'unmappedMeshCodes':unmapped,
        'muscleEnglishDetailsRows':len(details),'source':SOURCE,'evidence':evidence,
        'limitations':['M/MH variant labels share catalog IDs; the MH display behavior is not established by this label parser.',
            'Pin meshes are landmark geometry, not additional organs or independent anatomical structures.',
            'Source data has not been independently checked by a qualified anatomy reviewer.']}
    result={'byCode':bycode,'tables':tables,'scenes':tables['scenes'],'groups':tables['groups'],
        'regions':tables['regions'],'pins':[dict(row,prefix=prefix) for (prefix,num),row in pins.items()],
        'source':SOURCE,'summary':summary}
    (output/'atlas-labels.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
    # Compact English-only surface index is convenient for browser ingestion.
    surface_index={code:{k:v for k,v in entry.items() if k not in ('sourceRow','translations')}
        for code,entry in bycode.items() if entry['kind']=='surface'}
    (output/'models-en.json').write_text(json.dumps(surface_index,ensure_ascii=False,separators=(',',':'))+'\n')
    (output/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'output':str(output/'atlas-labels.json'),**{k:summary[k] for k in ['modelRows','pinRows','mappedMeshCodes','mappedKindCounts','unmappedMeshCodes']}},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--app',type=Path,required=True,help='Path to the source application')
    p.add_argument('--output',type=Path,default=Path('data-source/atlas-analysis/labels'))
    p.add_argument('--mesh-inventory',type=Path,default=Path('data-source/atlas-analysis/parsed/meshes.json'))
    a=p.parse_args();recover(a.app,a.output,a.mesh_inventory)
