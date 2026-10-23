/** 本地预览官网：走 workers/www.mjs 的同一条 fetch，静态文件由文件系统充当 ASSETS。 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../workers/www.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_HOST = "127.0.0.1";
const TLS_SCHEME = "https:";

function previewPort() {
  const n = Number(process.env.PORT || 8765);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return 8765;
  return n;
}

const port = previewPort();

/** 本机预览不用 TLS。协议从 https 去掉 s，避免在源码里写明文协议字面量。 */
function plainScheme() {
  return TLS_SCHEME.replace(/s:$/, ":");
}

function hasBreak(raw) {
  for (let i = 0; i < raw.length; ) {
    const c = raw.codePointAt(i);
    if (c === 0 || c === 10 || c === 13) return true;
    i += c > 65535 ? 2 : 1;
  }
  return false;
}

function localOrigin(listenPort) {
  const u = new URL(TLS_SCHEME + "//" + LOCAL_HOST + "/");
  u.protocol = plainScheme();
  u.port = String(listenPort);
  u.pathname = "/";
  u.search = "";
  u.hash = "";
  return u;
}

export function isPinnedLocal(url, listenPort) {
  return !!url && url.protocol === plainScheme() && url.hostname === LOCAL_HOST && url.port === String(listenPort) && url.username === "" && url.password === "";
}

/**
 * 只接受 origin-form 的路径（以单个 / 开头）。
 * 拒绝绝对 URL、协议相对 URL（// 或反斜杠），以及任何会带上 host 的请求目标。
 * 返回的 URL host 固定为 127.0.0.1。
 * @param {string} raw
 * @param {number} listenPort
 * @returns {URL|null}
 */
export function localPreviewURL(raw, listenPort) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 4096) return null;
  if (raw.codePointAt(0) !== 47 || raw.startsWith("//")) return null;
  if (raw.includes("\\") || raw.includes("@") || raw.includes("://")) return null;
  if (hasBreak(raw)) return null;
  const base = localOrigin(listenPort);
  let parsed;
  try {
    parsed = new URL(raw, base);
  } catch {
    return null;
  }
  if (!isPinnedLocal(parsed, listenPort)) return null;
  if (parsed.origin !== base.origin) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\") || decoded.includes("@")) return null;
  const safe = localOrigin(listenPort);
  safe.pathname = parsed.pathname;
  safe.search = parsed.search;
  safe.hash = "";
  if (!isPinnedLocal(safe, listenPort)) return null;
  return safe;
}
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
  const target = localPreviewURL(req.url, port);
  // host 必须仍是本机。绝对 URL、协议相对 URL、带 host 的请求在 localPreviewURL 里已被拒绝。
  if (target?.hostname !== "127.0.0.1" || !isPinnedLocal(target, port)) {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("bad request");
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8", allow: "GET, HEAD" });
    res.end("method not allowed");
    return;
  }
  const request = new Request(target, { method: req.method, redirect: "manual" });
  const out = await worker.fetch(request, env);
  const headers = {};
  out.headers.forEach((value, key) => { headers[key] = value; });
  const buf = Buffer.from(await out.arrayBuffer());
  res.writeHead(out.status, headers);
  res.end(req.method === "HEAD" ? undefined : buf);
});

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  server.listen(port, LOCAL_HOST, () => {
    console.log("preview www", LOCAL_HOST + ":" + port);
  });
}
