#!/usr/bin/env python3
"""Decode Unity geometry and scene inventory without modifying the supplied app.

Requires UnityPy==1.25.4 and numpy. Outputs contain source assets; choose their
location deliberately. This tool does not decrypt databases or unlock content.
"""
import argparse
import collections
import hashlib
import json
import pathlib
import time

import numpy as np
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def vector(value, dimensions=3):
    return [getattr(value, axis) for axis in 'xyzw'[:dimensions]]


def pointer(value):
    return {'fileId': value.m_FileID, 'pathId': value.m_PathID}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--geometry', action='store_true', help='Decode and save vertex/index arrays as NPZ')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if args.geometry:
        (args.output / 'geometry').mkdir(exist_ok=True)
    files = [args.data / 'resources.assets'] + sorted(args.data.glob('sharedassets*.assets')) + sorted(args.data.glob('level[0-9]*'))
    summary = {
        'tool': 'UnityPy', 'toolVersion': UnityPy.__version__,
        'authority': 'shipped-artifact-static-parser', 'files': [],
        'limitations': [
            'Static decoding does not establish clinical meaning or rendered behavior.',
            'Coded mesh identifiers are not verified English anatomy labels.',
            'Protected catalog is not decrypted.',
        ],
    }
    rows = {name: [] for name in ['meshes', 'gameobjects', 'transforms', 'meshfilters', 'renderers', 'materials', 'textures', 'failures']}
    type_counts = collections.Counter()
    start = time.time()
    for file_number, source in enumerate(files):
        if not source.is_file():
            continue
        env = UnityPy.load(str(source))
        objects = list(env.objects)
        counts = collections.Counter(obj.type.name for obj in objects)
        type_counts.update(counts)
        asset_file = next(iter(env.files.values()))
        summary['files'].append({
            'file': source.name, 'sha256': digest(source), 'bytes': source.stat().st_size,
            'objects': len(objects), 'types': dict(counts),
            'externals': [external.path for external in asset_file.externals],
        })
        for obj in objects:
            kind = obj.type.name
            if kind not in ['Mesh', 'GameObject', 'Transform', 'MeshFilter', 'MeshRenderer', 'Material', 'Texture2D']:
                continue
            try:
                data = obj.parse_as_object()
                row = {'file': source.name, 'pathId': obj.path_id}
                if kind == 'Mesh':
                    row.update(name=data.m_Name, prefix=data.m_Name.split('_')[0],
                        headerVertices=data.m_VertexData.m_VertexCount,
                        submeshes=len(data.m_SubMeshes),
                        declaredTriangles=sum(s.indexCount // 3 for s in data.m_SubMeshes if s.topology == 0),
                        topologies=sorted(set(s.topology for s in data.m_SubMeshes)),
                        compressed=data.m_MeshCompression)
                    if args.geometry:
                        handler = MeshHandler(data)
                        handler.process()
                        positions = np.asarray(handler.m_Vertices, dtype='<f4')
                        normals = np.asarray(handler.m_Normals or [], dtype='<f4')
                        uv = np.asarray(handler.m_UV0 or [], dtype='<f4')
                        triangles = handler.get_triangles()
                        indices = np.asarray([index for submesh in triangles for tri in submesh for index in tri], dtype='<u4')
                        assert positions.shape == (handler.m_VertexCount, 3), 'Invalid position shape'
                        assert len(indices) % 3 == 0 and (not len(indices) or indices.max() < len(positions)), 'Invalid indices'
                        assert np.isfinite(positions).all(), 'Non-finite positions'
                        boundaries = np.cumsum([0] + [len(submesh) * 3 for submesh in triangles]).tolist()
                        filename = f'{source.name}-{obj.path_id}.npz'
                        np.savez_compressed(args.output / 'geometry' / filename, positions=positions, normals=normals, uv=uv, indices=indices)
                        row.update(vertices=len(positions), triangles=len(indices) // 3,
                            bounds=[positions.min(axis=0).tolist(), positions.max(axis=0).tolist()],
                            normals=len(normals), uv=len(uv), submeshIndexOffsets=boundaries,
                            geometry=filename, geometryBytes=(args.output / 'geometry' / filename).stat().st_size)
                    rows['meshes'].append(row)
                elif kind == 'GameObject':
                    row.update(name=data.m_Name, active=data.m_IsActive,
                        components=[dict(typeId=int(c.component.type), **pointer(c.component)) for c in data.m_Component])
                    rows['gameobjects'].append(row)
                elif kind == 'Transform':
                    row.update(gameObject=data.m_GameObject.m_PathID, parent=data.m_Father.m_PathID,
                        children=[c.m_PathID for c in data.m_Children], position=vector(data.m_LocalPosition),
                        rotation=vector(data.m_LocalRotation, 4), scale=vector(data.m_LocalScale))
                    rows['transforms'].append(row)
                elif kind == 'MeshFilter':
                    row.update(gameObject=data.m_GameObject.m_PathID, mesh=pointer(data.m_Mesh))
                    rows['meshfilters'].append(row)
                elif kind == 'MeshRenderer':
                    row.update(gameObject=data.m_GameObject.m_PathID, materials=[pointer(m) for m in data.m_Materials])
                    rows['renderers'].append(row)
                elif kind == 'Material':
                    props = data.m_SavedProperties
                    row.update(name=data.m_Name, shader=pointer(data.m_Shader),
                        colors={n: [v.r, v.g, v.b, v.a] for n, v in props.m_Colors},
                        floats=dict(props.m_Floats), textures={n: dict(**pointer(v.m_Texture), scale=vector(v.m_Scale, 2), offset=vector(v.m_Offset, 2)) for n, v in props.m_TexEnvs})
                    rows['materials'].append(row)
                elif kind == 'Texture2D':
                    row.update(name=data.m_Name, width=data.m_Width, height=data.m_Height,
                        format=int(data.m_TextureFormat), streamed=bool(data.m_StreamData and data.m_StreamData.path))
                    rows['textures'].append(row)
            except Exception as exc:
                rows['failures'].append({'file': source.name, 'type': kind, 'pathId': obj.path_id, 'error': str(exc)[:250]})
        if counts.get('Mesh') or file_number % 20 == 0:
            print(source.name, 'objects', len(objects), 'decoded meshes', len(rows['meshes']), 'errors', len(rows['failures']), flush=True)
        del objects, env
    meshes = rows['meshes']
    summary.update(totalTypes=dict(type_counts), meshPrefixes=dict(collections.Counter(m['prefix'] for m in meshes)),
        meshObjects=len(meshes), uniqueMeshNames=len({m['name'] for m in meshes}),
        decodedVertices=sum(m.get('vertices', 0) for m in meshes), decodedTriangles=sum(m.get('triangles', 0) for m in meshes),
        geometryBytes=sum(m.get('geometryBytes', 0) for m in meshes),
        **{name: len(value) for name, value in rows.items() if name != 'meshes'}, seconds=round(time.time() - start, 2))
    for name, value in rows.items():
        (args.output / f'{name}.json').write_text(json.dumps(value, separators=(',', ':')))
    (args.output / 'summary.json').write_text(json.dumps(summary, indent=2))
    print('SUMMARY', json.dumps({k: v for k, v in summary.items() if k not in ['files', 'totalTypes']}), flush=True)
    if rows['failures']:
        raise SystemExit('Some objects failed; inspect failures.json before claiming complete recovery.')


if __name__ == '__main__':
    main()
