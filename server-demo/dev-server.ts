/**
 * Adapter A：本地开发服务器。
 *
 * 用 node:http 把标准的 Request / Response 接到 Node 的 IncomingMessage /
 * ServerResponse 上，业务逻辑全在 cloud-functions/_lib/handlers.ts 里，
 * 与线上 Cloud Functions 跑的是同一份代码。
 *
 * 这里没有用任何 Web 框架，是刻意的：这个 demo 要展示的是 SDK，不是 Express。
 */
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { handleApi } from "../cloud-functions/_lib/handlers.js";

const PORT = Number(process.env["PORT"] ?? 8787);
// 编译产物在 dist-demo/ 下镜像仓库的目录结构，所以要多退一层才回到仓库根。
const PUBLIC_DIR = fileURLToPath(new URL("../../server-demo/public/", import.meta.url));

const MIME: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const method = req.method ?? "GET";
  const url = `http://${req.headers.host ?? `localhost:${PORT}`}${req.url ?? "/"}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const single of Array.isArray(value) ? value : [value]) headers.append(key, single);
  }

  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await readRequestBody(req) : undefined;
  return new Request(url, { method, headers, ...(body && body.length > 0 ? { body } : {}) });
}

async function writeWebResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function serveStatic(res: ServerResponse, pathname: string): Promise<void> {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  // 目录穿越防护：规范化后不允许跳出 public/。
  const resolved = normalize(join(PUBLIC_DIR, relative));
  if (!resolved.startsWith(PUBLIC_DIR.replace(new RegExp(`${sep}$`), "") + sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const file = await readFile(resolved);
    res.writeHead(200, {
      "Content-Type": MIME[extname(resolved)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not Found");
  }
}

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname;

  const task = pathname.startsWith("/api/")
    ? toWebRequest(req)
        .then((request) =>
          handleApi(request, {
            // token 只存在于这个 Node 进程里，从不下发给浏览器。
            MAKERS_API_TOKEN: process.env["MAKERS_API_TOKEN"],
            MAKERS_REGION: process.env["MAKERS_REGION"],
          }),
        )
        .then((response) => writeWebResponse(res, response))
    : serveStatic(res, pathname);

  task.catch((error: unknown) => {
    console.error(error);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal Server Error");
  });
});

server.listen(PORT, () => {
  const token = process.env["MAKERS_API_TOKEN"];
  console.log(`\n  EdgeOne Makers SDK 调用观察台\n`);
  console.log(`  → http://localhost:${PORT}\n`);
  console.log(`  token   ${token ? "已配置" : "缺失（复制 .env.example 为 .env 并填入）"}`);
  console.log(`  region  ${process.env["MAKERS_REGION"] ?? "未设置，SDK 会自动探测"}\n`);
});
