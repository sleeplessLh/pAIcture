import { createServer } from "node:http";

const port = Number(process.env.PORT || 8789);
const token = process.env.CHATGPT_EXTRACTOR_TOKEN || "";
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean));
const sharePath = /^\/share\/[a-z0-9-]+\/?$/i;
const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_768) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://localhost");
  if (request.method === "GET" && requestUrl.pathname === "/health") return json(response, 200, { ok: true });
  if (request.method !== "POST" || requestUrl.pathname !== "/retrieve") return json(response, 404, { error: "Not found" });
  if (token && request.headers.authorization !== `Bearer ${token}`) return json(response, 401, { error: "Unauthorized" });
  const origin = request.headers.origin;
  if (origin && allowedOrigins.size && !allowedOrigins.has(origin)) return json(response, 403, { error: "Origin not allowed" });
  try {
    const body = await readJson(request);
    const target = new URL(body.url);
    if (target.protocol !== "https:" || target.hostname !== "chatgpt.com" || !sharePath.test(target.pathname)) return json(response, 400, { error: "Invalid ChatGPT share URL" });
    console.info("[RETRIEVE] Fetching validated ChatGPT share");
    const upstream = await fetch(target, { redirect: "follow", headers, signal: AbortSignal.timeout(25_000) });
    if (!upstream.ok) throw new Error(`UPSTREAM_${upstream.status}`);
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) throw new Error("UPSTREAM_NOT_HTML");
    const html = await upstream.text();
    if (html.length > 5_000_000) throw new Error("UPSTREAM_TOO_LARGE");
    if (!html.includes("__reactRouterContext.streamController.enqueue")) throw new Error("CONVERSATION_DATA_NOT_FOUND");
    console.info("[RETRIEVE] Complete", { bytes: html.length });
    return json(response, 200, { html });
  } catch (error) {
    console.error("[RETRIEVE] Failed", error);
    return json(response, 502, { error: "Unable to retrieve shared conversation" });
  }
}).listen(port, "0.0.0.0", () => console.info(`[RETRIEVE] Listening on ${port}`));
