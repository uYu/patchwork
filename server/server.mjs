import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(process.env.PATCHWORK_DIST ?? join(here, "../dist"));
const binary = resolve(process.env.PATCHWORK_AI_BINARY ?? join(here, "../bin/patchwork-ai"));
const port = Number(process.env.PORT ?? 8080);
const requestedSearches = Number(process.env.PATCHWORK_MAX_SEARCHES);
const maxSearches = Math.min(
  Number.isInteger(requestedSearches) && requestedSearches > 0 ? requestedSearches : 4,
  availableParallelism(),
);
let activeSearches = 0;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function validRequest(value) {
  if (!value || typeof value !== "object") return false;
  const { input, difficulty, seed } = value;
  if ((difficulty !== "normal" && difficulty !== "hard") ||
      !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff ||
      !Array.isArray(input) || input.length < 178 || input.length > 211 ||
      !input.every(Number.isInteger)) return false;
  const n = input[177];
  if (n < 0 || n > 33 || input.length !== 178 + n ||
      (n && (input[176] < 0 || input[176] >= n)) ||
      input[170] < 0 || input[170] > 1 || input[171] < 0 || input[171] > 5 ||
      input[172] < 0 || input[172] > 31 || input[173] < -1 || input[173] > 1 ||
      input[174] < -1 || input[174] > 1 || input[175] !== 0 ||
      new Set(input.slice(178)).size !== n ||
      input.slice(178).some((id) => id < 0 || id > 32)) return false;
  for (const start of [0, 85]) {
    if (input.slice(start, start + 81).some((cell) => cell < -1 || cell > 33) ||
        input[start + 81] < 0 || input[start + 81] > 10000 ||
        input[start + 82] < 0 || input[start + 82] > 100 ||
        input[start + 83] < 0 || input[start + 83] > 53 ||
        (input[start + 84] !== 0 && input[start + 84] !== 1)) return false;
  }
  return true;
}

async function body(req) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 16384) throw new Error("请求过大");
  }
  return JSON.parse(text);
}

function nativeSearch(request, response) {
  return new Promise((resolveSearch, rejectSearch) => {
    const child = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 12000);
    const disconnected = () => { if (!response.writableEnded) child.kill("SIGKILL"); };
    response.once("close", disconnected);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 262144) child.kill("SIGKILL");
    });
    child.stdin.on("error", rejectSearch);
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectSearch);
    child.on("close", (code) => {
      clearTimeout(timer);response.off("close", disconnected);
      if (code !== 0) { rejectSearch(new Error(stderr || `AI 进程退出 ${code}`));return; }
      try { resolveSearch(JSON.parse(stdout)); } catch (error) { rejectSearch(error); }
    });
    const mode = request.difficulty === "hard" ? 1 : 0;
    child.stdin.end(`${mode} ${request.seed} ${request.input.length} ${request.input.join(" ")}\n`);
  });
}

async function serveFile(req, res, pathname) {
  const target = resolve(dist, `.${pathname}`);
  if (target !== dist && !target.startsWith(dist + sep)) {
    res.writeHead(403).end();return;
  }
  let file = target;
  try {
    if (!(await stat(file)).isFile()) file = join(dist, "index.html");
  } catch {
    if (pathname.startsWith("/assets/")) { res.writeHead(404).end();return; }
    file = join(dist, "index.html");
  }
  const headers = { "Content-Type": mime[extname(file)] ?? "application/octet-stream" };
  if (pathname.startsWith("/assets/")) headers["Cache-Control"] = "public, max-age=31536000, immutable";
  res.writeHead(200, headers);
  if (req.method === "HEAD") res.end();
  else createReadStream(file).pipe(res);
}

export const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    if (pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");return;
    }
    if (pathname === "/api/ai/search") {
      if (req.method !== "POST") { res.writeHead(405).end();return; }
      const request = await body(req);
      if (!validRequest(request)) { res.writeHead(400).end("Invalid AI request");return; }
      if (activeSearches >= maxSearches) { res.writeHead(503).end("AI service busy");return; }
      activeSearches++;
      let result;
      try { result = await nativeSearch(request, res); }
      finally { activeSearches--; }
      if (!res.destroyed) res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end();return; }
    await serveFile(req, res, decodeURIComponent(pathname));
  } catch (error) {
    if (!res.destroyed) res.writeHead(500).end("AI service failed");
    console.error(error);
  }
});

if (process.env.PATCHWORK_TEST_SERVER !== "1")
  server.listen(port, "0.0.0.0", () => console.log(`Patchwork server listening on ${port}`));
