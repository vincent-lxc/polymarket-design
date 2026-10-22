/** 本地预览官网：静态文件 + 与 Worker 相同的钱包页决策（无壳页自跳）。 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { leaderDecision } from "../workers/www.mjs";

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
};

function safeFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(root + path.sep) && full !== root) return null;
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  return null;
}

function send(res, file) {
  const ext = path.extname(file);
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url || "/", "http://127.0.0.1");
  const lead = leaderDecision(u.pathname);
  if (lead && lead.action === "redirect") {
    res.writeHead(lead.status, { Location: lead.to + u.search });
    res.end();
    return;
  }
  if (lead && lead.action === "wallet") {
    const page = safeFile(`/${lead.lang}/leader/${lead.addr}/index.html`);
    if (page) return send(res, page);
    const shell = safeFile(`/${lead.lang}/leader/_shell/index.html`);
    if (shell) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Wakeloom-Leader": "shell" });
      fs.createReadStream(shell).pipe(res);
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  const file = safeFile(u.pathname);
  if (file) return send(res, file);
  if (!u.pathname.endsWith("/")) {
    const idx = safeFile(u.pathname + "/");
    if (idx) {
      res.writeHead(301, { Location: u.pathname + "/" + u.search });
      res.end();
      return;
    }
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("not found");
});

server.listen(port, "127.0.0.1", () => {
  console.log("preview www http://127.0.0.1:" + port);
});
