"""Build exact cosine neighbours from the frozen vectors used for atlas positions."""
import argparse,csv,hashlib,json
from pathlib import Path
import numpy as np
p=argparse.ArgumentParser()
p.add_argument("--source",type=Path,required=True)
a=p.parse_args()
root=Path(__file__).resolve().parents[1]
public=root/"public/data"
def load(name):return json.loads((public/name).read_text(encoding="utf8"))
def indexed(name):
    with (a.source/name).open(encoding="utf-8-sig",newline="") as f:
        rows=sorted(csv.DictReader(f),key=lambda r:int(r["row_index"]))
    assert [int(r["row_index"]) for r in rows]==list(range(len(rows)))
    return [r["doc_id"] for r in rows]
title_ids=indexed("catalogue_doc_index.csv")
assert title_ids==[p["id"] for p in load("map.json")["points"]]
abstract_ids=indexed("doc_index.csv")
union_ids=indexed("union_doc_index.csv")
title_audit=json.loads((root/"docs/PROJECTION_3D_AUDIT.json").read_text())
specs=[
("titles","catalogue_title_specter.npy",title_ids,title_audit["source_sha256"]),
("abstracts","s_scibert.npy",abstract_ids,load("positions-abstracts.json")["source_sha256"]),
("union","union_specter.npy",union_ids,load("positions-union.json")["source_sha256"]),
("fulltext","fulltext_specter.npy",load("positions-fulltext.json")["ids"],load("positions-fulltext.json")["source_sha256"])]
for name,file,ids,expected in specs:
    vector_path=a.source/file
    digest=hashlib.sha256(vector_path.read_bytes()).hexdigest()
    assert digest==expected,(name,"Vector hash differs from positions release")
    if name!="titles":assert ids==load("positions-"+name+".json")["ids"]
    x=np.load(vector_path).astype(np.float64)
    assert x.shape==(len(ids),768) and np.isfinite(x).all()
    norm=np.linalg.norm(x,axis=1)
    assert np.all(norm>0)
    x/=norm[:,None]
    rows=[]
    for start in range(0,len(x),256):
        sim=x[start:start+256]@x.T
        sim[np.arange(len(sim)),np.arange(start,start+len(sim))]=-np.inf
        top=np.argsort(-sim,axis=1,kind="stable")[:,:50]
        rows.extend(top.tolist())
    assert len(rows)==len(ids)
    for i,row in enumerate(rows):
        assert i not in row and len(set(row))==50
        values=x[row]@x[i]
        assert np.all(values[:-1]>=values[1:]-1e-12)
    payload=dict(version=1,representation=name,metric="cosine",limit=50,source_sha256=digest,ids=ids,rows=rows)
    (public/("neighbours-"+name+".json")).write_text(json.dumps(payload,separators=(",",":")),encoding="utf8")
    print(name,len(ids),"hash verified; 50 exact cosine neighbours per paper",flush=True)
