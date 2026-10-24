#!/usr/bin/env python3
"""Export native Unity Texture2D images and material bindings, without modifying source.

Requires UnityPy==1.25.4. Use only for assets you have permission to reuse.
PNG exports preserve decoded dimensions; channel-packed Unity normal/specular maps
still require material-aware conversion before use with glTF.
"""
import argparse
import collections
import hashlib
import json
import pathlib
import re
import time

import UnityPy
from UnityPy.enums import TextureFormat


def sha256(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def pointer(pptr, source):
    external = None
    if pptr.m_FileID:
        external = source.externals[pptr.m_FileID - 1].path
    return {'fileId': pptr.m_FileID, 'pathId': pptr.m_PathID,
            'targetFile': pathlib.PurePosixPath(external).name if external else pathlib.Path(source.name).name}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    image_dir = args.output / 'png'
    image_dir.mkdir(exist_ok=True)
    files = [args.data / 'resources.assets'] + sorted(args.data.glob('sharedassets*.assets'))
    textures, materials, failures, empty = [], [], [], []
    started = time.time()
    for source in files:
        env = UnityPy.load(str(source))
        for obj in env.objects:
            if obj.type.name not in ['Texture2D', 'Material']:
                continue
            try:
                data = obj.parse_as_object()
                if obj.type.name == 'Material':
                    materials.append({'file': source.name, 'pathId': obj.path_id, 'name': data.m_Name,
                        'shader': pointer(data.m_Shader, obj.assets_file),
                        'textures': {name: {**pointer(tex.m_Texture, obj.assets_file),
                            'scale': [tex.m_Scale.x, tex.m_Scale.y], 'offset': [tex.m_Offset.x, tex.m_Offset.y]}
                            for name, tex in data.m_SavedProperties.m_TexEnvs}})
                    continue
                if not data.m_Width or not data.m_Height:
                    empty.append({'file': source.name, 'pathId': obj.path_id, 'name': data.m_Name,
                        'width': data.m_Width, 'height': data.m_Height,
                        'reason': 'Zero-size texture placeholder has no source pixels.'})
                    continue
                safe_name = re.sub(r'[^A-Za-z0-9_.-]+', '_', data.m_Name).strip('_')[:90] or 'texture'
                relative = f'png/{source.name}-{obj.path_id}-{safe_name}.png'
                path = args.output / relative
                image = data.image
                image.save(path, format='PNG', compress_level=6)
                image.close()
                try:
                    format_name = TextureFormat(data.m_TextureFormat).name
                except ValueError:
                    format_name = str(data.m_TextureFormat)
                textures.append({'file': source.name, 'pathId': obj.path_id, 'name': data.m_Name,
                    'width': data.m_Width, 'height': data.m_Height, 'format': int(data.m_TextureFormat),
                    'formatName': format_name, 'colorSpace': data.m_ColorSpace,
                    'mipCount': data.m_MipCount, 'png': relative, 'pngBytes': path.stat().st_size,
                    'sha256': sha256(path)})
                if len(textures) % 50 == 0:
                    print(f'Decoded {len(textures)} textures; {sum(t["pngBytes"] for t in textures):,} PNG bytes', flush=True)
            except Exception as exc:
                failures.append({'file': source.name, 'pathId': obj.path_id,
                    'type': obj.type.name, 'error': str(exc)[:300]})
        del env
    references = collections.defaultdict(list)
    for mat in materials:
        for slot, texture in mat['textures'].items():
            if texture['pathId']:
                references[(texture['targetFile'], texture['pathId'])].append({
                    'file': mat['file'], 'pathId': mat['pathId'], 'name': mat['name'], 'slot': slot})
    for texture in textures:
        texture['materialReferences'] = references[(texture['file'], texture['pathId'])]
    summary = {'tool': 'UnityPy', 'version': UnityPy.__version__, 'textureObjects': len(textures) + len(empty),
        'decodedTextures': len(textures), 'zeroSizePlaceholders': len(empty),
        'materials': len(materials), 'failures': len(failures),
        'pngBytes': sum(t['pngBytes'] for t in textures),
        'decodedPixels': sum(t['width'] * t['height'] for t in textures),
        'formats': dict(collections.Counter(t['formatName'] for t in textures)),
        'materialReferencedTextures': sum(bool(t['materialReferences']) for t in textures),
        'seconds': round(time.time() - started, 2),
        'limitations': ['Decoded texture pixels are not validated anatomical labels.',
            'Unity normal/specular packing needs conversion for glTF material use.',
            'Texture2D exports exclude procedural shader output and Cubemap textures.',
            'UI/font textures are included and must be filtered by mesh material references.']}
    for name, value in [('textures', textures), ('materials', materials), ('empty', empty), ('failures', failures), ('summary', summary)]:
        (args.output / f'{name}.json').write_text(json.dumps(value, indent=2))
    print(json.dumps(summary, indent=2), flush=True)
    if failures:
        raise SystemExit('Some textures/materials failed; inspect failures.json.')


if __name__ == '__main__':
    main()
