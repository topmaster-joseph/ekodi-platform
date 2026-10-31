#!/usr/bin/env python3
"""Offline integrity gate for private 9th-revision Jubilee book handoff.

This NEVER uploads manuscript bytes or authorizes edition publication.
The --expected file must come from the trusted publisher's GitHub source,
not the archive being inspected.
"""
import argparse, hashlib, json, os, stat, sys, zipfile
from pathlib import Path

def sha(x): return hashlib.sha256(x).hexdigest()
def check(v,reason):
    if not v: raise ValueError("PRIVATE_ARCHIVE_REJECTED:"+reason)
def safe(s):
    check(isinstance(s,str) and 4<len(s)<260 and "\\" not in s and "\x00" not in s
        and not s.startswith("/") and not s.endswith("/") and not (len(s)>1 and s[1]==":")
        and all(p not in ("",".","..") for p in s.split("/")),"unsafe-path")
    return s

def verify_zip(path, expected):
    p=Path(path)
    check(p.is_file() and not p.is_symlink(),"package-not-regular")
    pin=expected["artifactPackage"]
    check(expected.get("seriesId")=="EKODI-JUBILEE-THEOLOGY" and
        expected.get("sourceRevision")=="review-9","wrong-expected-edition")
    check(p.stat().st_size==pin["bytes"] and p.stat().st_size<100_000_000,"package-size")
    check(sha(p.read_bytes())==pin["sha256"],"package-hash")
    with zipfile.ZipFile(p) as z:
        info=z.infolist(); names=[safe(x.filename) for x in info]
        check(len(names)==11 and len(set(names))==11 and "manifest.json" in names,"archive-members")
        total=0
        for x in info:
            check(not x.flag_bits&1 and not stat.S_ISLNK(x.external_attr>>16),"encrypted-or-symlink")
            check(0<x.file_size<30_000_000,"individual-uncompressed-size")
            total+=x.file_size
            check(total<100_000_000,"uncompressed-budget")
            if x.compress_size:
                check(x.file_size/x.compress_size<=1000,"decompression-ratio")
        raw=z.read("manifest.json")
        check(sha(raw)==pin["manifestSha256"],"manifest-hash")
        m=json.loads(raw)
        check(m.get("schemaVersion")==1 and m.get("packageType")=="ekodi-private-editorial-ingest"
           and m.get("seriesId")==expected["seriesId"] and m.get("sourceRevision")=="review-9"
           and m.get("packageStatus")=="handoff-file-ready-not-yet-ingested","manifest-identity")
        ingress=m.get("privateIngress") or {}
        for k in ("registeredInEKODIPublisherR2","registeredInEKODIPublisherDB","verifiedStorageReadback",
                  "authorApproval","publisherApproval","publicCatalog","checkoutEnabled"):
            check(ingress.get(k) is False,"premature-"+k)
        check(ingress.get("releaseDate") is None and ingress.get("priceKrw") is None
              and ingress.get("ISBN") is None,"premature-commercial-release")
        files=m.get("fileDigests")
        check(isinstance(files,list) and len(files)==9,"file-count")
        mapping={}
        for item in files:
            name=safe(item.get("path"))
            check(name.startswith(("editions/01/","editions/02/","editorial/"))
                and name not in mapping,"source-path")
            check(item.get("kind")==name.rsplit(".",1)[-1] and
                  isinstance(item.get("bytes"),int) and item["bytes"]>0 and
                  isinstance(item.get("sha256"),str) and len(item["sha256"])==64,"file-record")
            mapping[name]=item
        check(set(names)==set(mapping)|{"manifest.json","README_비공개이관.md"},"unexpected-payload")
        check(len([p for p in mapping if p.startswith("editorial/")])==3,"editorial-count")
        volumes={v["reviewId"]:v for v in expected["volumeAssets"]}
        check(set(volumes)=={"EJT-01-REVIEW","EJT-02-REVIEW"},"volume-ids")
        for num in ("01","02"):
            selected=[p for p in mapping if p.startswith("editions/"+num+"/")]
            check(len(selected)==3 and {p.rsplit(".",1)[-1] for p in selected}
                  =={"epub","docx","pdf"},"missing-edition-file")
            for name in selected:
                ext=name.rsplit(".",1)[-1]
                check(mapping[name]["sha256"]==volumes["EJT-"+num+"-REVIEW"][ext+"Sha256"],
                      "edition-hash:"+name)
        count=0
        for name,entry in mapping.items():
            digest=hashlib.sha256(); size=0
            with z.open(name) as stream:
                for part in iter(lambda: stream.read(262144),b""):
                    size+=len(part);check(size<30_000_000,"read-budget")
                    digest.update(part)
            check(size==entry["bytes"] and digest.hexdigest()==entry["sha256"],
                  "asset-hash:"+name)
            count+=size
    return {"schemaVersion":1,"seriesId":expected["seriesId"],"sourceRevision":"review-9",
            "handoffId":expected["handoffId"],"packageSha256":pin["sha256"],
            "manifestSha256":pin["manifestSha256"],"fileCount":9,"editionFileCount":6,
            "editorialFileCount":3,"sourceBytes":count,
            "verification":"archive-crc-and-manifest-and-all-nine-file-sha256-verified",
            "state":"offline-package-verified-awaiting-authenticated-publisher-ingestion",
            "publisherR2ReadbackVerified":False,"publisherDatabaseReceiptVerified":False,
            "authorApproved":False,"publisherApproved":False,"publicCatalog":False,
            "checkoutEnabled":False,"scheduledReleaseAt":None}

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--package",required=True)
    ap.add_argument("--expected",required=True)
    ap.add_argument("--receipt",help="new local receipt; refuses to overwrite")
    a=ap.parse_args()
    try:
        pin=json.loads(Path(a.expected).read_text(encoding="utf-8"))
        result=verify_zip(a.package,pin)
        output=json.dumps(result,ensure_ascii=False,indent=2)+"\n"
        if a.receipt:
            fd=os.open(a.receipt,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
            with os.fdopen(fd,"w",encoding="utf-8") as f:f.write(output)
        print(output)
    except (OSError,ValueError,KeyError,TypeError,zipfile.BadZipFile) as e:
        print("REJECTED: "+str(e),file=sys.stderr)
        return 1
    return 0

if __name__=="__main__":
    sys.exit(main())
