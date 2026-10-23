/** 本地预览官网：走 workers/www.mjs 的同一条 fetch，静态文件由文件系统充当 ASSETS。 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../workers/www.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 8765);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".xml": "application/xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

function safeFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(root + path.sep) && full !== root) return null;
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  return null;
}

const env = {
  ASSETS: {
    async fetch(request) {
      const u = new URL(request.url);
      const file = safeFile(u.pathname);
      if (file) {
        const ext = path.extname(file);
        return new Response(fs.readFileSync(file), {
          status: 200,
          headers: { "content-type": types[ext] || "application/octet-stream" },
        });
      }
      if (!u.pathname.endsWith("/") && safeFile(u.pathname + "/")) {
        return new Response(null, { status: 308, headers: { Location: u.pathname + "/" + u.search } });
      }
      return new Response("not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    },
  },
};

const server = http.createServer(async (req, res) => {
  const request = new Request("http://127.0.0.1:" + port + (req.url || "/"), { method: req.method || "GET", redirect: "manual" });
  const out = await worker.fetch(request, env);
  const headers = {};
  out.headers.forEach((value, key) => { headers[key] = value; });
  const buf = Buffer.from(await out.arrayBuffer());
  res.writeHead(out.status, headers);
  res.end(req.method === "HEAD" ? undefined : buf);
});

server.listen(port, "127.0.0.1", () => {
  console.log("preview www http://127.0.0.1:" + port);
});
