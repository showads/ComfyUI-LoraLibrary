"""Local LoRA index and Civitai resolver. No remote downloads or automatic changes to LoRA files."""
import asyncio
import hashlib
import json
import os
import sqlite3
import threading
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
import folder_paths
from aiohttp import web
from server import PromptServer

DATA = Path(os.environ.get("LORA_LIBRARY_DATA", str(Path(__file__).resolve().parent / ".library-data")))
DATA.mkdir(parents=True, exist_ok=True)
LOCK = threading.RLock()

def database():
    db = sqlite3.connect(DATA / "library.sqlite3", timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("CREATE TABLE IF NOT EXISTS loras (name TEXT PRIMARY KEY, size INTEGER, mtime REAL, sha TEXT, metadata TEXT, checked REAL DEFAULT 0, favorite INTEGER DEFAULT 0)")
    return db

def local_file(name):
    if name not in folder_paths.get_filename_list("loras"):
        raise ValueError("LoRA not present in configured directories")
    path = folder_paths.get_full_path("loras", name)
    if not path or not Path(path).is_file():
        raise ValueError("LoRA file unavailable")
    return Path(path)

def list_loras():
    names = folder_paths.get_filename_list("loras")
    with LOCK, database() as db:
        for name in names:
            try: stat = local_file(name).stat()
            except (ValueError, OSError): continue
            db.execute("""INSERT INTO loras(name,size,mtime) VALUES(?,?,?)
                ON CONFLICT(name) DO UPDATE SET
                sha=CASE WHEN size=excluded.size AND mtime=excluded.mtime THEN sha ELSE NULL END,
                metadata=CASE WHEN size=excluded.size AND mtime=excluded.mtime THEN metadata ELSE NULL END,
                checked=CASE WHEN size=excluded.size AND mtime=excluded.mtime THEN checked ELSE 0 END,
                size=excluded.size,mtime=excluded.mtime""", (name, stat.st_size, stat.st_mtime))
        if names: db.execute("DELETE FROM loras WHERE name NOT IN (" + ",".join("?" for _ in names) + ")", names)
        else: db.execute("DELETE FROM loras")
        rows = db.execute("SELECT * FROM loras ORDER BY name COLLATE NOCASE").fetchall()
    return [dict(name=r["name"], size=r["size"], favorite=bool(r["favorite"]), metadata=json.loads(r["metadata"]) if r["metadata"] else None) for r in rows]

def request_json(url):
    headers = {"User-Agent":"ComfyUI-LoraLibrary/0.1", "Accept":"application/json"}
    token = os.environ.get("CIVITAI_API_KEY","").strip()
    if token: headers["Authorization"] = "Bearer " + token
    with urlopen(Request(url, headers=headers), timeout=15) as res:
        return json.loads(res.read(3_000_000))

def resolve(name, refresh=False):
    path = local_file(name)
    with LOCK, database() as db:
        row = db.execute("SELECT * FROM loras WHERE name=?", (name,)).fetchone()
        if row is None: raise ValueError("Scan library before resolving")
        sha = row["sha"]
        if not sha:
            h = hashlib.sha256()
            with path.open("rb") as f:
                for chunk in iter(lambda: f.read(4*1024*1024), b""): h.update(chunk)
            sha = h.hexdigest().upper()
            db.execute("UPDATE loras SET sha=? WHERE name=?", (sha,name))
        if row["metadata"] and not refresh and time.time() - row["checked"] < 86400:
            return json.loads(row["metadata"])
    try:
        version = request_json("https://civitai.com/api/v1/model-versions/by-hash/" + quote(sha))
        model_id = version.get("modelId")
        model = request_json("https://civitai.com/api/v1/models/" + str(model_id)) if model_id else {}
        published = version.get("publishedAt") or version.get("createdAt") or ""
        all_versions = model.get("modelVersions") or []
        updates = [v for v in all_versions if v.get("id") != version.get("id") and v.get("baseModel") == version.get("baseModel") and (v.get("publishedAt") or v.get("createdAt") or "") > published]
        result = dict(status="matched", source="civitai", name=model.get("name") or name,
            creator=(model.get("creator") or {}).get("username"), model_id=model_id,
            version_id=version.get("id"), installed_version=version.get("name"),
            base_model=version.get("baseModel"), trained_words=version.get("trainedWords") or [],
            description=model.get("description") or "", version_description=version.get("description") or "",
            url="https://civitai.com/models/" + str(model_id) + "?modelVersionId=" + str(version.get("id")),
            images=[dict(url=i.get("url"), width=i.get("width"), height=i.get("height"), meta=i.get("meta") or {}) for i in version.get("images") or [] if i.get("url")],
            versions=[dict(id=v.get("id"), name=v.get("name"), base_model=v.get("baseModel"), installed=v.get("id")==version.get("id"), compatible=v.get("baseModel")==version.get("baseModel")) for v in all_versions],
            has_update=bool(updates), update_count=len(updates))
    except HTTPError as exc:
        if exc.code != 404: raise
        result = dict(status="unmatched", images=[], versions=[], trained_words=[], has_update=False)
    with LOCK, database() as db:
        db.execute("UPDATE loras SET metadata=?,checked=? WHERE name=?", (json.dumps(result), time.time(), name))
    return result

def register_routes():
    routes = PromptServer.instance.routes
    @routes.get("/lora-library/list")
    async def listing(request):
        return web.json_response({"items":await asyncio.to_thread(list_loras)})
    @routes.post("/lora-library/resolve")
    async def resolving(request):
        try:
            d = await request.json()
            return web.json_response(await asyncio.to_thread(resolve,d.get("name",""),bool(d.get("force"))))
        except ValueError as e: return web.json_response({"error":str(e)},status=400)
        except (HTTPError,URLError,TimeoutError) as e: return web.json_response({"error":str(e)},status=502)
        except Exception: return web.json_response({"error":"Metadata lookup failed"},status=500)
    @routes.post("/lora-library/favorite")
    async def favorite(request):
        try:
            d = await request.json()
            local_file(d.get("name",""))
            with LOCK,database() as db:
                db.execute("UPDATE loras SET favorite=? WHERE name=?",(int(bool(d.get("favorite"))),d["name"]))
            return web.json_response({"ok":True})
        except ValueError as e: return web.json_response({"error":str(e)},status=400)
