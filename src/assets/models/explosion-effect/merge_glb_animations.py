"""Merge every animation in a .glb into a single clip. Usage: python3 merge_glb_animations.py file.glb [ClipName]"""
import json, struct, sys
path = sys.argv[1]; name = sys.argv[2] if len(sys.argv) > 2 else "Explode"
d = open(path, "rb").read()
jl = struct.unpack("<I", d[12:16])[0]; j = json.loads(d[20:20 + jl]); rest = d[20 + jl:]
ch, sa = [], []
for a in j.get("animations", []):
    off = len(sa); sa += a["samplers"]
    for c in a["channels"]:
        c = dict(c); c["sampler"] += off; ch.append(c)
j["animations"] = [{"name": name, "channels": ch, "samplers": sa}]
js = json.dumps(j, separators=(",", ":")).encode(); js += b" " * ((4 - len(js) % 4) % 4)
out = struct.pack("<III", 0x46546C67, 2, 20 + len(js) + len(rest)) + struct.pack("<II", len(js), 0x4E4F534A) + js + rest
open(path, "wb").write(out)
print(f"{len(ch)} channels merged into '{name}', {len(out)//1024} KB")
