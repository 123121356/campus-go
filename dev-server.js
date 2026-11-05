// 의존성 없는 로컬 개발 서버:  node dev-server.js  → http://localhost:3000
// 정적 파일 + /api/* (Vercel 함수와 같은 코드)를 함께 띄웁니다. .env 파일을 자동으로 읽습니다.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

if (fs.existsSync(path.join(ROOT, ".env"))) {
  for (const line of fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/[^a-z]/g, "");
    const file = path.join(ROOT, "api", `${name}.js`);
    if (!name || !fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); }
    let raw = "";
    for await (const c of req) raw += c;
    const vreq = { method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams), body: raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : undefined };
    const vres = {
      statusCode: 200,
      setHeader: (k, v) => res.setHeader(k, v),
      status(c) { this.statusCode = c; return this; },
      send(b) { res.writeHead(this.statusCode); res.end(b); },
    };
    try {
      const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
      await mod.default(vreq, vres);
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`캠퍼스GO → http://localhost:${PORT}`));
