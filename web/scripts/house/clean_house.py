"""Rebuild the Kenney two-storey house GLB for the site: bake the node scale, rotate 180 deg about y (door to +z,
garage to +x), remove the front wall dormer (the panels' roof plane must be clear) and patch the roof under it.
Usage (from web/): python -I scripts/house/clean_house.py <kenney two-story house .glb> public/models/house.glb
Source: https://poly.pizza/m/htvFgnVP4d (Kenney, City Kit Suburban, CC0 1.0)."""
import struct, json, sys, numpy as np
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
ln = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20+ln]); off = 20+ln
bl = struct.unpack('<I', b[off:off+4])[0]; bin_ = b[off+8:off+8+bl]
def acc(i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]; st = bv.get('byteOffset', 0)+a.get('byteOffset', 0)
    ct = {5126: ('f', 4), 5123: ('H', 2), 5125: ('I', 4), 5121: ('B', 1)}[a['componentType']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    stride = bv.get('byteStride', ct[1]*n)
    return np.array([struct.unpack_from('<'+ct[0]*n, bin_, st+k*stride) for k in range(a['count'])], dtype=np.float64)
S = 10.0  # baked node scale
R = np.diag([-1.0, 1.0, -1.0])  # 180 deg about y
ROOF_N = np.array([0.0, np.cos(np.radians(37)), -np.sin(np.radians(37))])  # south plane normal, pre-rotation
def in_dormer(c):  # pre-rotation, scaled units
    return (0.0 < c[0] < 0.34) and (c[1] > 0.86) and (c[2] < -0.03)
prims = []
removed = 0
for p in j['meshes'][0]['primitives']:
    V = acc(p['attributes']['POSITION'])*S; I = acc(p['indices']).ravel().astype(int).reshape(-1, 3)
    T = V[I]; C = T.mean(1)
    n = np.cross(T[:, 1]-T[:, 0], T[:, 2]-T[:, 0]); n /= np.maximum(np.linalg.norm(n, axis=1), 1e-12)[:, None]
    keep = np.array([not (in_dormer(c) and abs(float(nn @ ROOF_N)) < 0.95) for c, nn in zip(C, n)])
    removed += int((~keep).sum())
    tris = T[keep]
    name = j['materials'][p['material']]['name']
    if name == 'roof':
        # patch: the hole the dormer left in the south plane (points on the plane, pre-rotation)
        hole = np.array([[0.018, 0.854, -0.333], [0.318, 0.854, -0.333], [0.318, 0.936, -0.224], [0.318, 0.966, -0.184],
                         [0.168, 1.077, -0.035], [0.018, 0.966, -0.184], [0.018, 0.936, -0.224]])
        fan = np.array([[hole[0], hole[k+1], hole[k]] for k in range(1, len(hole)-1)])  # winding: normal towards -z/+y
        nrm = np.cross(fan[0, 1]-fan[0, 0], fan[0, 2]-fan[0, 0])
        if nrm @ ROOF_N < 0: fan = fan[:, ::-1]
        tris = np.vstack([tris, fan])
    tris = tris @ R.T  # rotate (R is its own inverse, symmetric)
    fn = np.cross(tris[:, 1]-tris[:, 0], tris[:, 2]-tris[:, 0]); fn /= np.maximum(np.linalg.norm(fn, axis=1), 1e-12)[:, None]
    prims.append((name, tris.reshape(-1, 3).astype(np.float32), np.repeat(fn, 3, axis=0).astype(np.float32)))
# write a minimal GLB: flat (unindexed) triangles with per-face normals, one primitive per material
blob = bytearray(); views = []; accs = []; out_prims = []; mats = []
def view(data, target):
    while len(blob) % 4: blob.append(0)
    views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(data), 'target': target}); blob.extend(data); return len(views)-1
for name, P, N in prims:
    mi = len(mats); src_m = next(m for m in j['materials'] if m['name'] == name)
    mats.append({'name': name, 'pbrMetallicRoughness': {'baseColorFactor': src_m['pbrMetallicRoughness']['baseColorFactor'], 'metallicFactor': 0.0, 'roughnessFactor': 0.9}})
    pv = view(P.tobytes(), 34962); nv = view(N.tobytes(), 34962)
    accs.append({'bufferView': pv, 'componentType': 5126, 'count': len(P), 'type': 'VEC3', 'min': P.min(0).tolist(), 'max': P.max(0).tolist()}); pa = len(accs)-1
    accs.append({'bufferView': nv, 'componentType': 5126, 'count': len(N), 'type': 'VEC3'}); na = len(accs)-1
    out_prims.append({'attributes': {'POSITION': pa, 'NORMAL': na}, 'material': mi, 'mode': 4})
gltf = {'asset': {'version': '2.0', 'generator': 'clean_house.py (Kenney City Kit Suburban, CC0, via poly.pizza)'},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'house', 'mesh': 0}], 'meshes': [{'name': 'house', 'primitives': out_prims}],
        'materials': mats, 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(blob)}]}
js = json.dumps(gltf, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
while len(blob) % 4: blob.append(0)
total = 12 + 8 + len(js) + 8 + len(blob)
with open(dst, 'wb') as f:
    f.write(b'glTF' + struct.pack('<II', 2, total)); f.write(struct.pack('<I', len(js)) + b'JSON' + js); f.write(struct.pack('<I', len(blob)) + b'BIN\x00' + bytes(blob))
allP = np.vstack([P for _, P, _ in prims])
print('removed faces', removed, '| tris', sum(len(P)//3 for _, P, _ in prims), '| bbox min', allP.min(0).round(3), 'max', allP.max(0).round(3), '| bytes', total)
