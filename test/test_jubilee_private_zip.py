import hashlib, importlib.util, json, os, pathlib, tempfile, unittest, zipfile

SCRIPT=pathlib.Path(__file__).resolve().parents[1]/"scripts"/"verify-jubilee-private-zip.py"
spec=importlib.util.spec_from_file_location("verify_jubilee",SCRIPT)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
sha=lambda x:hashlib.sha256(x).hexdigest()

class PackageBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix="ekodi-review9-")
        self.path=pathlib.Path(self.tmp.name)/"package.zip"
        self.files={}
        for v in ("01","02"):
            for ext in ("docx","epub","pdf"):
                self.files[f"editions/{v}/source.{ext}"]=f"sample-{v}-{ext}".encode()
        for ext in ("md","json","txt"):
            self.files[f"editorial/note.{ext}"]=f"note-{ext}".encode()
        self.files["README_비공개이관.md"]=b"readme"
        self.manifest={
            "schemaVersion":1,"packageType":"ekodi-private-editorial-ingest",
            "seriesId":"EKODI-JUBILEE-THEOLOGY","sourceRevision":"review-9",
            "packageStatus":"handoff-file-ready-not-yet-ingested",
            "privateIngress":{
                **{x:False for x in ("registeredInEKODIPublisherR2","registeredInEKODIPublisherDB",
                    "verifiedStorageReadback","authorApproval","publisherApproval",
                    "publicCatalog","checkoutEnabled")},
                "releaseDate":None,"priceKrw":None,"ISBN":None,
            },
            "fileDigests":[{"path":name,"kind":name.rsplit(".",1)[-1],
                "sha256":sha(data),"bytes":len(data)}
                for name,data in self.files.items() if name!="README_비공개이관.md"],
        }
    def tearDown(self):self.tmp.cleanup()
    def build(self):
        self.files["manifest.json"]=json.dumps(self.manifest,ensure_ascii=False).encode()
        with zipfile.ZipFile(self.path,"w",compression=zipfile.ZIP_DEFLATED) as z:
            for name,body in self.files.items():z.writestr(name,body)
        return {"seriesId":"EKODI-JUBILEE-THEOLOGY","sourceRevision":"review-9",
            "handoffId":"EJT-20261030-REVIEW9-PRIVATE-HANDOFF",
            "artifactPackage":{"sha256":sha(self.path.read_bytes()),"bytes":self.path.stat().st_size,
                "manifestSha256":sha(self.files["manifest.json"])},
            "volumeAssets":[{
                "reviewId":f"EJT-{v}-REVIEW",
                **{ext+"Sha256":sha(self.files[f"editions/{v}/source.{ext}"])
                   for ext in ("docx","epub","pdf")}}
                for v in ("01","02")]}
    def test_verified_archive_is_still_private_not_ingested(self):
        pin=self.build()
        r=mod.verify_zip(self.path,pin)
        self.assertEqual(r["fileCount"],9)
        self.assertFalse(r["publisherR2ReadbackVerified"])
        self.assertFalse(r["checkoutEnabled"])
    def test_manifest_hash_tampering_rejected(self):
        pin=self.build()
        self.manifest["privateIngress"]["checkoutEnabled"]=True
        self.build()
        pin["artifactPackage"]["sha256"]=sha(self.path.read_bytes())
        pin["artifactPackage"]["bytes"]=self.path.stat().st_size
        with self.assertRaisesRegex(ValueError,"manifest-hash"):
            mod.verify_zip(self.path,pin)
    def test_premature_public_release_claim_rejected(self):
        self.manifest["privateIngress"]["checkoutEnabled"]=True
        pin=self.build()
        with self.assertRaisesRegex(ValueError,"premature-checkoutEnabled"):
            mod.verify_zip(self.path,pin)
    def test_unexpected_file_or_traversal_rejected(self):
        pin=self.build()
        self.files["../escape.txt"]=b"bad"
        with zipfile.ZipFile(self.path,"w") as z:
            for n,b in self.files.items():z.writestr(n,b)
        pin["artifactPackage"]["sha256"]=sha(self.path.read_bytes())
        pin["artifactPackage"]["bytes"]=self.path.stat().st_size
        with self.assertRaisesRegex(ValueError,"unsafe-path|archive-members"):
            mod.verify_zip(self.path,pin)
    def test_missing_edition_file_is_rejected(self):
        # Retain the bytes for the expected edition hash, but drop the manifest record.
        self.manifest["fileDigests"]=[v for v in self.manifest["fileDigests"] if
            v["path"]!="editions/02/source.pdf"]
        pin=self.build()
        with self.assertRaisesRegex(ValueError,"archive-members|file-count"):
            mod.verify_zip(self.path,pin)

if __name__=="__main__":unittest.main()
