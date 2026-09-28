import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { exportDocumentCss } from "../lib/export-document-style.mjs";

const port = Number(process.env.PORT || 8789);
const token = process.env.CHATGPT_EXTRACTOR_TOKEN || "";
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean));
const maxConcurrentJobs = Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS || 1));
const maxQueuedJobs = Math.max(1, Number(process.env.MAX_QUEUED_JOBS || 12));
let activeJobs = 0;
const queuedJobs = [];
const sharePath = /^\/share\/[a-z0-9-]+\/?$/i;
const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

if (isProduction && !token) {
  throw new Error("CHATGPT_EXTRACTOR_TOKEN is required in production.");
}

function acquireJobSlot() {
  if (activeJobs < maxConcurrentJobs) {
    activeJobs += 1;
    return Promise.resolve(createRelease());
  }
  if (queuedJobs.length >= maxQueuedJobs) return null;
  return new Promise((resolve) => queuedJobs.push(() => {
    activeJobs += 1;
    resolve(createRelease());
  }));
}

function createRelease() {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeJobs = Math.max(0, activeJobs - 1);
    const next = queuedJobs.shift();
    if (next) queueMicrotask(next);
  };
}

function isAllowedShareUrl(value) {
  try {
    const url = value instanceof URL ? value : new URL(value);
    return url.protocol === "https:" && url.hostname === "chatgpt.com" && sharePath.test(url.pathname);
  } catch {
    return false;
  }
}

function isTrustedImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname === "chatgpt.com" ||
      url.hostname.endsWith(".oaiusercontent.com") ||
      url.hostname.endsWith(".oaistatic.com") ||
      url.hostname.endsWith(".openai.com")
    );
  } catch {
    return false;
  }
}

async function fetchShareFollowingSafeRedirects(initialUrl, options = {}) {
  let target = new URL(initialUrl);
  for (let redirects = 0; redirects <= 4; redirects++) {
    if (!isAllowedShareUrl(target)) throw new Error("UNSAFE_REDIRECT");
    const response = await fetch(target, { ...options, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("INVALID_REDIRECT");
    target = new URL(location, target);
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

const cjkCssPath = fileURLToPath(new URL("../node_modules/@fontsource-variable/noto-sans-sc/index.css", import.meta.url));
const cjkCssDirectory = dirname(cjkCssPath);
const cjkFontCss = readFileSync(cjkCssPath, "utf8").replace(/url\((\.\/files\/[^)]+)\)/g, (_, relativePath) => {
  const font = readFileSync(join(cjkCssDirectory, relativePath));
  return `url(data:font/woff2;base64,${font.toString("base64")})`;
});

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
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
        if (!isTrustedImageUrl(renderedImage.src)) continue;
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
  const pendingSlot = acquireJobSlot();
  if (!pendingSlot) {
    response.setHeader("Retry-After", "15");
    return json(response, 503, { error: "Service is busy. Please try again shortly." });
  }
  const releaseJobSlot = await pendingSlot;
  try {
    if (requestUrl.pathname === "/render/pdf") {
      const body = await readJson(request, 40_000_000);
      if (typeof body.html !== "string" || body.html.length > 38_000_000) throw new Error("INVALID_DOCUMENT");
      const paper = ["a4", "a3", "letter"].includes(body.config?.paper) ? body.config.paper : "a4";
      const orientation = body.config?.orientation === "landscape" ? "landscape" : "portrait";
      const paperFormat = paper === "a3" ? "A3" : paper === "letter" ? "Letter" : "A4";
      const margin = paper === "a3" ? "21.7mm" : "18mm";
      const baseGeometry = paper === "a3" ? { width: 1123, height: 1587, margin: 82 } : paper === "letter" ? { width: 816, height: 1056, margin: 68 } : { width: 794, height: 1123, margin: 68 };
      const geometry = orientation === "landscape" ? { width: baseGeometry.height, height: baseGeometry.width, margin: baseGeometry.margin } : baseGeometry;
      const composition = [1, 2, 4].includes(body.config?.composition) ? body.config.composition : 1;
      const slices = Array.isArray(body.config?.slices) ? body.config.slices
        .filter((slice) => Number.isFinite(slice?.offset) && Number.isFinite(slice?.end) && slice.offset >= 0 && slice.end > slice.offset)
        .slice(0, 500)
        .map((slice) => ({ offset: Math.round(slice.offset), end: Math.round(slice.end) })) : [];
      const sourceHeight = Number.isFinite(body.config?.sourceHeight) && body.config.sourceHeight > 0 ? body.config.sourceHeight : null;
      const pageOverrideCss = `@page { size: ${paperFormat} ${orientation}; margin: ${margin}; }`;
      const safeDocument = body.html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
        .replace(/javascript:/gi, "");
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1 });
        await page.route("**/*", (route) => route.abort("blockedbyclient"));
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
        if (slices.length) {
          const layoutMetrics = await page.evaluate(({ slices, sourceHeight, composition, geometry, orientation }) => {
            const source = document.querySelector(".conversation-document");
            if (!(source instanceof HTMLElement)) throw new Error("EXPORT_DOCUMENT_NOT_FOUND");
            const serverSourceHeight = source.scrollHeight;
            const heightScale = sourceHeight ? serverSourceHeight / sourceHeight : 1;
            const { width: pageWidth, height: pageHeight, margin } = geometry;
            const printableWidth = pageWidth - margin * 2;
            const printableHeight = pageHeight - margin * 2;
            const sourceTop = source.getBoundingClientRect().top;
            const elementBreaks = [...source.querySelectorAll(".conversation-exchange, .conversation-message, .conversation-message-content > *:not(:first-child), tr")]
              .map((element) => Math.round(element.getBoundingClientRect().top - sourceTop))
              .filter((position) => position > 0 && position < serverSourceHeight);
            const lineBreaks = [...source.querySelectorAll(".conversation-message-content p, .conversation-message-content li, .conversation-message-content pre")]
              .flatMap((element) => {
                const range = document.createRange();
                range.selectNodeContents(element);
                const rects = [...range.getClientRects()].sort((a, b) => a.top - b.top || a.left - b.left);
                const lines = [];
                for (const rect of rects) {
                  const previous = lines.at(-1);
                  if (previous && Math.abs(previous.top - rect.top) < 1.5) previous.bottom = Math.max(previous.bottom, rect.bottom);
                  else lines.push({ top: rect.top, bottom: rect.bottom });
                }
                return lines.slice(1).map((line, index) => Math.round((lines[index].bottom + line.top) / 2 - sourceTop));
              });
            const safeBreaks = [...elementBreaks, ...lineBreaks].sort((a, b) => a - b);
            const protectedRanges = [...source.querySelectorAll(".conversation-message.user, pre, blockquote, table, .conversation-image, img")]
              .map((element) => { const rect = element.getBoundingClientRect(); return { top: Math.round(rect.top - sourceTop), bottom: Math.round(rect.bottom - sourceTop) }; })
              .filter((range) => range.bottom - range.top < printableHeight);
            const scaledSlices = [];
            for (let offset = 0; offset < serverSourceHeight;) {
              const idealEnd = Math.min(offset + printableHeight, serverSourceHeight);
              const protectedAtEnd = protectedRanges.find((range) => range.top < idealEnd && range.bottom > idealEnd && range.top > offset + printableHeight * .3);
              const targetEnd = protectedAtEnd?.top || idealEnd;
              const earliestBreak = offset + Math.floor(printableHeight * .68);
              const safeEnd = safeBreaks.filter((position) => position >= earliestBreak && position <= targetEnd).at(-1);
              const end = idealEnd === serverSourceHeight ? serverSourceHeight : safeEnd || targetEnd;
              scaledSlices.push({ offset, end });
              offset = end;
            }
            const paperColor = source.dataset.appearance === "dark" ? "#202225" : "#fbfaf7";
            const gap = Math.round(Math.min(pageWidth, pageHeight) * .018);
            const columns = composition === 4 ? 2 : orientation === "landscape" ? 2 : 1;
            const rows = composition === 4 ? 2 : orientation === "landscape" ? 1 : 2;
            const cellWidth = (printableWidth - gap * (columns - 1)) / columns;
            const cellHeight = (printableHeight - gap * (rows - 1)) / rows;
            const logicalScale = Math.min(cellWidth / pageWidth, cellHeight / pageHeight);
            const renderedWidth = pageWidth * logicalScale;
            const renderedHeight = pageHeight * logicalScale;
            const style = document.createElement("style");
            style.textContent = `html,body{margin:0!important;padding:0!important;background:${paperColor}!important}.final-output-page{position:relative;width:${printableWidth}px;height:${printableHeight}px;box-sizing:border-box;break-after:page;page-break-after:always;overflow:hidden;background:${paperColor}}.final-output-page:last-child{break-after:auto;page-break-after:auto}.final-grid{position:relative;width:100%;height:100%;display:grid;grid-template-columns:repeat(${columns},${cellWidth}px);grid-template-rows:repeat(${rows},${cellHeight}px);gap:${gap}px}.final-tile{position:relative;width:${cellWidth}px;height:${cellHeight}px;overflow:visible;justify-self:center;align-self:center}.logical-paper{position:absolute;width:${pageWidth}px;height:${pageHeight}px;transform:scale(${logicalScale});transform-origin:top left;background:${paperColor};box-shadow:0 0 0 1px rgba(100,95,88,.24)}.logical-window{position:absolute;left:${margin}px;top:${margin}px;width:${printableWidth}px;height:${printableHeight}px;overflow:hidden}.logical-window>.conversation-document{position:absolute!important;left:0!important;width:${printableWidth}px!important;max-width:none!important;margin:0!important}`;
            document.head.appendChild(style);
            const root = document.createDocumentFragment();
            for (let start = 0; start < scaledSlices.length; start += composition) {
              const items = scaledSlices.slice(start, start + composition);
              const outputPage = document.createElement("section");
              outputPage.className = "final-output-page";
              if (composition === 1) {
                const windowElement = document.createElement("div");
                windowElement.className = "logical-window";
                windowElement.style.left = "0";
                windowElement.style.top = "0";
                const clone = source.cloneNode(true);
                clone.style.top = `${-items[0].offset}px`;
                windowElement.appendChild(clone);
                outputPage.appendChild(windowElement);
              } else {
                const grid = document.createElement("div");
                grid.className = "final-grid";
                items.forEach((slice, index) => {
                  const tile = document.createElement("div");
                  tile.className = "final-tile";
                  const row = Math.floor(index / columns);
                  const remaining = items.length - row * columns;
                  if (columns === 2 && remaining === 1 && index === items.length - 1) {
                    tile.style.gridColumn = "1 / 3";
                  }
                  if (columns === 1 && items.length === 1) {
                    tile.style.gridRow = "1 / 3";
                  }
                  if (composition === 4 && items.length <= 2) {
                    tile.style.gridRow = "1 / 3";
                  }
                  const logicalPaper = document.createElement("div");
                  logicalPaper.className = "logical-paper";
                  logicalPaper.style.left = `${(cellWidth - renderedWidth) / 2}px`;
                  logicalPaper.style.top = `${(cellHeight - renderedHeight) / 2}px`;
                  const windowElement = document.createElement("div");
                  windowElement.className = "logical-window";
                  const clone = source.cloneNode(true);
                  clone.style.top = `${-slice.offset}px`;
                  windowElement.appendChild(clone);
                  logicalPaper.appendChild(windowElement);
                  tile.appendChild(logicalPaper);
                  grid.appendChild(tile);
                });
                outputPage.appendChild(grid);
              }
              root.appendChild(outputPage);
            }
            document.body.replaceChildren(root);
            return { clientSourceHeight: sourceHeight, clientLogicalPages: slices.length, serverSourceHeight, heightScale, logicalPages: scaledSlices.length };
          }, { slices, sourceHeight, composition, geometry, orientation });
          console.info("[PDF] Final layout composed", layoutMetrics);
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          });
        }
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
    if (!isAllowedShareUrl(target)) return json(response, 400, { error: "Invalid ChatGPT share URL" });
    console.info("[RETRIEVE] Fetching validated ChatGPT share");
    const upstream = await fetchShareFollowingSafeRedirects(target, { headers, signal: AbortSignal.timeout(25_000) });
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
  } finally {
    releaseJobSlot();
  }
}).listen(port, "0.0.0.0", () => console.info(`[RETRIEVE] Listening on ${port}`));
