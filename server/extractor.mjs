import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { exportDocumentCss } from "../lib/export-document-style.mjs";

const port = Number(process.env.PORT || 8789);
const token = process.env.CHATGPT_EXTRACTOR_TOKEN || "";
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean));
const sharePath = /^\/share\/[a-z0-9-]+\/?$/i;
const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const cjkCssPath = fileURLToPath(new URL("../node_modules/@fontsource-variable/noto-sans-sc/index.css", import.meta.url));
const cjkCssDirectory = dirname(cjkCssPath);
const cjkFontCss = readFileSync(cjkCssPath, "utf8").replace(/url\((\.\/files\/[^)]+)\)/g, (_, relativePath) => {
  const font = readFileSync(join(cjkCssDirectory, relativePath));
  return `url(data:font/woff2;base64,${font.toString("base64")})`;
});

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request, maxBytes = 32_768) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sharedAssetPointers(html) {
  return [...new Set(html.match(/sediment:\/\/file_[a-z0-9_-]+(?:\?shared_conversation_id=[a-z0-9-]+)?/gi) || [])];
}

async function resolveSharedImages(target, html, cookieHeader = "") {
  const pointers = sharedAssetPointers(html);
  if (!pointers.length) return { assets: {}, warnings: [] };
  console.info("[IMAGE] Shared image assets detected", { count: pointers.length });
  const directAssets = {};
  for (const pointer of pointers) {
    const fileId = pointer.match(/sediment:\/\/([^?]+)/i)?.[1];
    if (!fileId) continue;
    try {
      const sharedId = target.pathname.split("/").filter(Boolean).at(-1);
      const endpoint = new URL(`/backend-anon/files/download/${encodeURIComponent(fileId)}`, target);
      endpoint.search = new URLSearchParams({
        shared_conversation_id: sharedId,
        inline: "false",
        download_intent: "false",
      }).toString();
      const metadataResponse = await fetch(endpoint, {
        headers: { ...headers, Cookie: cookieHeader, Referer: target.toString() },
        signal: AbortSignal.timeout(20_000),
      });
      if (!metadataResponse.ok) continue;
      const metadata = await metadataResponse.json();
      if (typeof metadata.download_url !== "string") continue;
      const downloadUrl = new URL(metadata.download_url);
      if (downloadUrl.protocol !== "https:" || !downloadUrl.hostname.endsWith(".oaiusercontent.com")) continue;
      const imageResponse = await fetch(downloadUrl, { signal: AbortSignal.timeout(25_000) });
      const mimeType = (imageResponse.headers.get("content-type") || "").split(";")[0].toLowerCase();
      if (!imageResponse.ok || !mimeType.startsWith("image/")) continue;
      const image = Buffer.from(await imageResponse.arrayBuffer());
      directAssets[pointer] = {
        src: `data:${mimeType};base64,${image.toString("base64")}`,
        alt: "ChatGPT generated image",
      };
    } catch {}
  }
  console.info("[IMAGE] Anonymous assets resolved", { resolved: Object.keys(directAssets).length });
  if (Object.keys(directAssets).length === pointers.length) {
    return { assets: directAssets, warnings: [] };
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const capturedImageResponses = new Map();
    const captureTasks = [];
    page.on("response", (response) => {
      const contentType = (response.headers()["content-type"] || "").split(";")[0].toLowerCase();
      if (!contentType.startsWith("image/") || !/oaiusercontent\.com/i.test(response.url())) return;
      captureTasks.push(response.body()
        .then((body) => capturedImageResponses.set(response.url(), { body, contentType }))
        .catch(() => undefined));
    });
    const navigation = await page.goto(target.toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForFunction(
      () => [...document.images].some((image) => image.naturalWidth >= 256 && image.naturalHeight >= 256),
      undefined,
      { timeout: 15_000 },
    ).catch(() => undefined);
    await Promise.allSettled(captureTasks);
    console.info("[IMAGE] Rendered share inspected", {
      status: navigation?.status(),
      title: await page.title(),
      imageCount: await page.locator("img").count(),
      url: page.url(),
    });
    const renderedImages = await page.evaluate(() => {
      const unique = new Map();
      for (const image of [...document.images]) {
        const src = image.currentSrc || image.src;
        if (!((image.naturalWidth >= 256 && image.naturalHeight >= 256) || /oaiusercontent\.com/i.test(src)) || unique.has(src)) continue;
        unique.set(src, {
        src: image.currentSrc || image.src,
        alt: image.alt || "ChatGPT generated image",
        width: image.naturalWidth || undefined,
        height: image.naturalHeight || undefined,
        });
      }
      return [...unique.values()];
    });
    const resolved = { ...directAssets };
    const fetchedImageSources = new Set();
    for (const renderedImage of renderedImages) {
      try {
        const captured = capturedImageResponses.get(renderedImage.src);
        const imageResponse = captured ? null : await page.request.get(renderedImage.src, { timeout: 25_000 });
        const mimeType = captured?.contentType || (imageResponse?.headers()["content-type"] || "").split(";")[0].toLowerCase();
        if (!captured && (!imageResponse?.ok() || !mimeType.startsWith("image/"))) continue;
        const image = captured?.body || await imageResponse.body();
        const asset = {
          src: `data:${mimeType};base64,${image.toString("base64")}`,
          alt: renderedImage.alt,
          width: renderedImage.width,
          height: renderedImage.height,
        };
        resolved[`image-title:${renderedImage.alt.replace(/^Generated image:\s*/i, "").trim().toLowerCase()}`] = asset;
        fetchedImageSources.add(renderedImage.src);
      } catch {}
    }
    console.info("[IMAGE] Rendered assets resolved", {
      candidates: renderedImages.length,
      captured: capturedImageResponses.size,
      resolved: fetchedImageSources.size,
    });
    const sharedId = target.pathname.split("/").filter(Boolean).at(-1);
    for (let index = 0; index < pointers.length; index++) {
      const pointer = pointers[index];
      const fileId = pointer.match(/sediment:\/\/([^?]+)/i)?.[1];
      if (!fileId) continue;
      const query = new URLSearchParams({ shared_conversation_id: sharedId }).toString();
      const candidates = [
        new URL(`/backend-api/files/${encodeURIComponent(fileId)}/download?${query}`, target).toString(),
        new URL(`/backend-api/files/${encodeURIComponent(fileId)}/content?${query}`, target).toString(),
      ].filter(Boolean);
      for (const candidate of candidates) {
        try {
          const imageResponse = await page.request.get(candidate, { timeout: 25_000 });
          const mimeType = (imageResponse.headers()["content-type"] || "").split(";")[0].toLowerCase();
          if (!imageResponse.ok() || !mimeType.startsWith("image/")) continue;
          const image = await imageResponse.body();
          resolved[pointer] = {
            src: `data:${mimeType};base64,${image.toString("base64")}`,
            alt: renderedImages[index]?.alt || "ChatGPT generated image",
            width: renderedImages[index]?.width,
            height: renderedImages[index]?.height,
          };
          break;
        } catch {}
      }
    }
    const pointerAssets = pointers.filter((pointer) => resolved[pointer]).length;
    const recoveredAssets = Math.min(pointers.length, pointerAssets + fetchedImageSources.size);
    const failures = pointers.slice(recoveredAssets);
    for (const [pointer, asset] of Object.entries(resolved)) console.info("[IMAGE] Asset loaded", { pointer: pointer.replace(/\?.*$/, ""), width: asset.width, height: asset.height });
    if (failures.length) console.warn("[IMAGE] Asset retrieval failed", { count: failures.length });
    return {
      assets: resolved,
      warnings: failures.length ? [`${failures.length} shared image${failures.length === 1 ? "" : "s"} could not be retrieved from the public conversation.`] : [],
    };
  } finally {
    await browser.close();
  }
}

createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://localhost");
  if (request.method === "GET" && requestUrl.pathname === "/health") return json(response, 200, { ok: true });
  if (request.method !== "POST" || !["/retrieve", "/render/pdf"].includes(requestUrl.pathname)) return json(response, 404, { error: "Not found" });
  if (token && request.headers.authorization !== `Bearer ${token}`) return json(response, 401, { error: "Unauthorized" });
  const origin = request.headers.origin;
  if (origin && allowedOrigins.size && !allowedOrigins.has(origin)) return json(response, 403, { error: "Origin not allowed" });
  try {
    if (requestUrl.pathname === "/render/pdf") {
      const body = await readJson(request, 40_000_000);
      if (typeof body.html !== "string" || body.html.length > 38_000_000) throw new Error("INVALID_DOCUMENT");
      const paper = ["a4", "a3", "letter"].includes(body.config?.paper) ? body.config.paper : "a4";
      const orientation = body.config?.orientation === "landscape" ? "landscape" : "portrait";
      const paperFormat = paper === "a3" ? "A3" : paper === "letter" ? "Letter" : "A4";
      const margin = paper === "a3" ? "21.7mm" : "18mm";
      const pageOverrideCss = `@page { size: ${paperFormat} ${orientation}; margin: ${margin}; }`;
      const safeDocument = body.html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
        .replace(/javascript:/gi, "");
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
        await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${cjkFontCss}\n${exportDocumentCss}\n${pageOverrideCss}</style></head><body>${safeDocument}</body></html>`, { waitUntil: "load" });
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map(async (image) => {
            if (!image.complete) await new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            });
            if (image.naturalWidth && image.decode) await image.decode().catch(() => undefined);
          }));
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          document.documentElement.dataset.exportReady = "true";
        });
        await page.emulateMedia({ media: "print" });
        const pdf = await page.pdf({
          format: paperFormat,
          landscape: orientation === "landscape",
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: true,
          headerTemplate: "<span></span>",
          footerTemplate: `<div style="box-sizing:border-box;width:100%;padding:0 ${margin};color:#8a8a85;font:9px Arial,sans-serif;display:flex;justify-content:space-between"><span>pAIcture</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
          margin: { top: margin, right: margin, bottom: margin, left: margin },
          tagged: true,
          outline: true,
        });
        response.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Length": String(pdf.length),
          "Content-Disposition": "attachment; filename=conversation.pdf",
          "Cache-Control": "no-store",
        });
        response.end(pdf);
        console.info("[PDF] Vector export complete", { bytes: pdf.length });
        return;
      } finally {
        await browser.close();
      }
    }
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
    const cookieHeader = (upstream.headers.getSetCookie?.() || [])
      .map((cookie) => cookie.split(";", 1)[0])
      .join("; ");
    const resolvedImages = await resolveSharedImages(target, html, cookieHeader);
    console.info("[RETRIEVE] Complete", { bytes: html.length });
    return json(response, 200, { html, assets: resolvedImages.assets, assetWarnings: resolvedImages.warnings });
  } catch (error) {
    console.error("[RETRIEVE] Failed", error);
    return json(response, 502, { error: "Unable to retrieve shared conversation" });
  }
}).listen(port, "0.0.0.0", () => console.info(`[RETRIEVE] Listening on ${port}`));
