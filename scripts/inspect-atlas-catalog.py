#!/usr/bin/env python3
"""Offline, read-only structural catalog audit; does not decrypt or export anatomy.

The parser intentionally handles only the observed IL2CPP v39 layout. It records
structural evidence and offsets, not credentials, medical prose, or geometry.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
import re
import struct


SECTIONS = (
    "stringLiteral stringLiteralData string events properties methods "
    "parameterDefaultValues fieldDefaultValues fieldAndParameterDefaultValueData "
    "fieldMarshaledSizes parameters fields genericParameters genericParameterConstraints "
    "genericContainers nestedTypes interfaces vtableMethods interfaceOffsets "
    "typeDefinitions images assemblies fieldRefs referencedAssemblies attributeData "
    "attributeDataRange unresolvedVirtualCallParameterTypes unresolvedVirtualCallParameterRanges "
    "windowsRuntimeTypeNames windowsRuntimeStrings exportedTypeDefinitions"
).split()
SOURCE = "https://github.com/SamboyCoding/Cpp2IL/tree/development/LibCpp2IL/Metadata"
REDACT = re.compile(r"key|password|token|secret|credential", re.I)


def digest(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1048576), b""):
            h.update(chunk)
    return {"relative_path": str(path), "size_bytes": path.stat().st_size, "sha256": h.hexdigest()}


def inspect(app: Path):
    data_root = app / "Contents/Resources/Data"
    metadata_path = data_root / "il2cpp_data/Metadata/global-metadata.dat"
    b = metadata_path.read_bytes()
    magic, version = struct.unpack_from("<II", b)
    assert magic == 0xFAB11BAF and version == 39, "Only observed v39 layout is supported"
    sections = {}
    for i, name in enumerate(SECTIONS):
        offset, size, count = struct.unpack_from("<III", b, 8 + i * 12)
        assert offset + size <= len(b), name
        sections[name] = dict(offset=offset, size=size, count=count)

    def string(index):
        start = sections["string"]["offset"] + index
        end = b.index(b"\0", start)
        assert end <= sections["string"]["offset"] + sections["string"]["size"]
        return b[start:end].decode("utf8", "replace")

    def table(name, stride):
        s = sections[name]
        assert s["size"] == s["count"] * stride, (name, s)
        return [s["offset"] + i * stride for i in range(s["count"])]

    # v39 dynamic widths in this artifact: type/type-definition/generic-container
    # indices 16-bit; parameter index 32-bit (68,465 records). All validated below.
    methods = []
    for i, off in enumerate(table("methods", 30)):
        name, owner, return_type, return_parameter, param_start, generic, token, flags, iflags, slot, count = struct.unpack_from("<IHHIIHIHHHH", b, off)
        methods.append({"name": string(name), "owner_type_index": owner,
                        "parameter_start": param_start, "parameter_count": count,
                        "method_index": i, "metadata_offset": off})
    fields = []
    for i, off in enumerate(table("fields", 10)):
        name, typ, token = struct.unpack_from("<IHI", b, off)
        fields.append({"name": string(name), "field_index": i, "metadata_offset": off})
    parameters = []
    for off in table("parameters", 10):
        name, token, typ = struct.unpack_from("<IIH", b, off)
        parameters.append(string(name))

    types = []
    for i, off in enumerate(table("typeDefinitions", 76)):
        name, namespace = struct.unpack_from("<II", b, off)
        field_start, method_start = struct.unpack_from("<II", b, off + 20)
        method_count, prop_count, field_count = struct.unpack_from("<HHH", b, off + 52)
        types.append({"name": string(name), "namespace": string(namespace),
                      "type_index": i, "metadata_offset": off,
                      "field_start": field_start, "field_count": field_count,
                      "method_start": method_start, "method_count": method_count})
    wanted = {"AnatomyAbstract", "AnatomyModel", "AnatomyPin", "AnatomySystemsExt",
              "AnatomyNodeHelper", "AnatomySystemsHelper", "MusclesLayersHandlerClass",
              "CASDbApi", "CASDatabaseFactory", "CASDb", "CASSQLiteMonoDb",
              "CASSQLiteNetDb", "CASSQLiteNetDbEx", "CASSceneHelper", "AnatomySystems", "SceneHelperSO"}
    selected = []
    for t in types:
        if t["name"] not in wanted:
            continue
        ms = methods[t["method_start"]:t["method_start"] + t["method_count"]]
        assert all(m["owner_type_index"] == t["type_index"] for m in ms), t
        safe_methods = []
        for m in ms:
            if REDACT.search(m["name"]) and m["name"] != "GetModelIdFromKey":
                continue
            p = parameters[m["parameter_start"]:m["parameter_start"] + m["parameter_count"]] if m["parameter_count"] else []
            safe_methods.append({**m, "parameter_names": [n for n in p if not REDACT.search(n)]})
        fs = fields[t["field_start"]:t["field_start"] + t["field_count"]]
        selected.append({**t, "methods": safe_methods,
                         "fields": [f for f in fs if not REDACT.search(f["name"])]})

    literal_offsets = [struct.unpack_from("<I", b, off)[0] for off in table("stringLiteral", 4)]
    literal_start = sections["stringLiteralData"]["offset"]
    literal_end = literal_start + sections["stringLiteralData"]["size"]
    sql_schema = []
    for i, start in enumerate(literal_offsets):
        end = literal_offsets[i + 1] + literal_start if i + 1 < len(literal_offsets) else literal_end
        pos = literal_start + start
        s = b[pos:end].decode("utf8", "replace")
        if not re.match(r"\s*SELECT\b", s, re.I):
            continue
        tables = sorted(set(re.findall(r"\b(?:FROM|JOIN)\s+([a-z][a-z0-9_]*)", s, re.I)))
        if tables:
            # Retain field/table identifiers; omit verbatim statements and values.
            sql_schema.append({"literal_index": i, "metadata_offset": pos, "tables": tables,
                               "columns": sorted(set(re.findall(r"\b(?:id|group_id|pref_scene|pref_view|type|search|layer|origin|insertion|innervation|action|isocode|muscles_id|region_id|unityscene|sort|[a-z]{2}_name)\b", s))),
                               "language_format_placeholders": bool(re.search(r"\{\d\}_name", s))})

    casdb = data_root / "StreamingAssets/anatomy3datlas.casdb"
    db = casdb.read_bytes()
    freq = collections.Counter(db)
    entropy = -sum(n / len(db) * math.log2(n / len(db)) for n in freq.values())
    settings_path = data_root / "StreamingAssets/aa/settings.json"
    settings = json.loads(settings_path.read_text())
    catalog_path = data_root / "StreamingAssets/aa/catalog.bin"
    cat = catalog_path.read_bytes()
    bundle_strings = [{"offset": m.start(), "name": m.group().decode()}
                      for m in re.finditer(rb"[A-Za-z0-9_()\-.]+\.bundle", cat)]
    return {"evidence_kind": "offline static metadata; no target execution", "parser_source": SOURCE,
            "artifact_identity": [digest(p) for p in [metadata_path, casdb, catalog_path, settings_path, app / "Contents/Frameworks/GameAssembly.dylib"]],
            "metadata_version": version, "sections": sections, "selected_types": selected,
            "sql_schema_observations": sql_schema,
            "casdb": {"size_bytes": len(db), "header_hex": db[:32].hex(), "entropy_bits_per_byte": entropy,
                      "sqlite_plaintext_header_present": db.startswith(b"SQLite format 3\0"),
                      "interpretation": "Opaque high-entropy payload; LoadCryptoDb metadata is consistent with a protected database. Encryption format not proven; no decryption attempted."},
            "addressables": {"version": settings.get("m_AddressablesVersion"), "build_target": settings.get("m_buildTarget"),
                             "catalog_header_hex": cat[:16].hex(), "bundle_string_observations": bundle_strings,
                             "interpretation": "Observed bundle names concern localization and Mono scripts, not a separately named anatomy model catalog."},
            "limitations": ["Method names and schema strings establish static structure, not runtime control flow.",
                            "No SQL rows, medical labels, vertex geometry or anatomy mapping were decrypted or exported.",
                            "Native method addresses and bodies were not reconstructed by this script.",
                            "ID-to-mesh relationship remains a candidate until Unity scene/component fields corroborate it."]}


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--app", type=Path, default=Path("/Applications/Anatomy 3D Atlas.app"))
    p.add_argument("--output", type=Path, default=Path("data-source/atlas-analysis/metadata/catalog-analysis.json"))
    args = p.parse_args()
    result = inspect(args.app)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"output": str(args.output), "metadata_version": result["metadata_version"],
                      "selected_type_count": len(result["selected_types"]),
                      "sql_schema_records": len(result["sql_schema_observations"]),
                      "casdb": result["casdb"]}, indent=2))
