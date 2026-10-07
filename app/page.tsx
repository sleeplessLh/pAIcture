"use client";
/* eslint-disable @next/next/no-img-element -- export previews are generated data URLs and must not pass through Next image optimization */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Download, FileImage, FileText, Link2, LoaderCircle, Moon, ShieldCheck, Sun, WandSparkles } from "lucide-react";
import { ConversationDocument } from "@/components/conversation-document";
import { ChatBubble3D, DocumentStack, EmptyDocumentVisual, FloatingPage, ProgressJourney, Sparkle, type JourneyStage } from "@/components/workshop-visuals";
import { documentTheme } from "@/lib/document-theme";
import { fitDisplayMath } from "@/lib/export-math-fit.mjs";
import { groupConversationExchanges, messagesForSelectedExchanges, type ConversationExchange } from "@/lib/conversation/exchanges";

type Platform = "chatgpt";
type Message = { id: string; role: "user" | "assistant"; html: string };
type Conversation = { title: string; platform: Platform; messages: Message[]; warnings?: string[] };
type PaperSize = "a4" | "a3" | "letter";
type Orientation = "portrait" | "landscape";
type PageComposition = 1 | 2 | 4;
type ExportConfig = { paper: PaperSize; orientation: Orientation; composition: PageComposition };
const platforms: Record<Platform, { name: string; mark: string }> = { chatgpt: { name: "ChatGPT", mark: "◎" } };
const paperSizes: Record<PaperSize, { label: string; width: number; height: number; margin: number }> = {
  a4: { label: "A4", width: 794, height: 1123, margin: 96 },
  a3: { label: "A3", width: 1123, height: 1587, margin: 96 },
  letter: { label: "Letter", width: 816, height: 1056, margin: 96 },
};

const extensionImportEvent = "PAICTURE_EXTENSION_IMPORT";

function conversationFromExtension(value: unknown): Conversation | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (payload.schemaVersion !== 1 || payload.source !== "paicture-extension" || payload.platform !== "chatgpt") return null;
  if (typeof payload.title !== "string" || payload.title.length > 500 || !Array.isArray(payload.messages) || payload.messages.length > 500) return null;
  if (typeof payload.sourceUrl !== "string" || detectPlatform(payload.sourceUrl) !== "chatgpt") return null;
  const messages: Message[] = [];
  let totalHtmlLength = 0;
  for (const candidate of payload.messages) {
    if (!candidate || typeof candidate !== "object") return null;
    const message = candidate as Record<string, unknown>;
    if (typeof message.id !== "string" || message.id.length > 500 || (message.role !== "user" && message.role !== "assistant") || typeof message.html !== "string") return null;
    totalHtmlLength += message.html.length;
    if (totalHtmlLength > 25_000_000) return null;
    messages.push({ id: message.id, role: message.role, html: message.html });
  }
  if (!messages.length) return null;
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.filter((warning): warning is string => typeof warning === "string").slice(0, 50) : undefined;
  return { title: payload.title.trim() || "ChatGPT conversation", platform: "chatgpt", messages, warnings };
}

function normalizeShareUrl(value: string) {
  return value.normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function requestConversation(value: string): Promise<Conversation> {
  const body = JSON.stringify({ url: normalizeShareUrl(value) });
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    // A sleeping free extractor can spend roughly 50 seconds waking before it
    // begins retrieval. Keep the browser alive beyond the server-side window.
    const timeout = window.setTimeout(() => controller.abort(), 125_000);
    try {
      const response = await fetch("/api/import/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({})) as Conversation & { error?: string; code?: string };
      if (response.ok) return payload as Conversation;
      const retryable = response.status === 502 || response.status === 503 || response.status === 504 || payload.code === "IMPORT_TEMPORARY_UNAVAILABLE";
      if (!retryable || attempt === 1) throw new Error(payload.error || "Unable to import this shared conversation.");
      lastError = new Error(payload.error || "The import service is still waking up.");
    } catch (reason) {
      lastError = reason;
      const isNetworkFailure = reason instanceof TypeError || (reason instanceof DOMException && reason.name === "AbortError");
      if (!isNetworkFailure || attempt === 1) throw reason;
    } finally {
      window.clearTimeout(timeout);
    }
    await delay(1_500);
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to import this shared conversation.");
}

function pageGeometry(config: ExportConfig) {
  const paper = paperSizes[config.paper];
  const rotated = config.orientation === "landscape";
  return { width: rotated ? paper.height : paper.width, height: rotated ? paper.width : paper.height, margin: paper.margin };
}

function detectPlatform(value: string): Platform | null {
  try {
    const normalized = normalizeShareUrl(value);
    const host = new URL(normalized).hostname.replace(/^www\./, "");
    if (host === "chatgpt.com" && /^\/share\/[a-z0-9-]+\/?$/i.test(new URL(normalized).pathname)) return "chatgpt";
  } catch {}
  return null;
}

async function waitForDocumentReady(root: HTMLElement) {
  await document.fonts.ready;
  await Promise.all([...root.querySelectorAll("img")].map(async (image) => {
    if (!image.complete) await new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    });
    if (image.naturalWidth && image.decode) await image.decode().catch(() => undefined);
  }));
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  fitDisplayMath(root);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function isIosBrowser() {
  return /iP(?:hone|ad|od)|Macintosh(?=.*Mobile)/.test(navigator.userAgent);
}

function isMobileBrowser() {
  return isIosBrowser() || /Android|Mobi/i.test(navigator.userAgent);
}

function submitPdfToNativeViewer(html: string, config: ExportConfig & { sourceHeight: number; slices: PageSlice[] }, filename: string) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/export/pdf";
  form.enctype = "multipart/form-data";
  form.target = "_self";
  form.style.display = "none";
  const addField = (name: string, value: string) => {
    const field = document.createElement("textarea");
    field.name = name;
    field.value = value;
    form.appendChild(field);
  };
  addField("html", html);
  addField("config", JSON.stringify(config));
  addField("filename", filename);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  // Opening an about:blank tab before an asynchronous export suspends the
  // originating page on iOS, so the export never finishes. Navigate the active
  // tab only after the file is ready; Safari's PDF/image viewer then exposes
  // the native Share Sheet and Save to Files actions.
  if (isIosBrowser()) {
    window.location.assign(href);
    return href;
  }
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return href;
}

function exportFilename(title: string) {
  return title.normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 80) || "paicture-chatgpt-export";
}

async function compressImageForPdf(src: string, targetCharacters: number) {
  if (!src.startsWith("data:image/") || src.length <= targetCharacters) return src;
  const image = new Image();
  image.src = src;
  await image.decode().catch(() => undefined);
  if (!image.naturalWidth || !image.naturalHeight) return src;

  let width = image.naturalWidth;
  let height = image.naturalHeight;
  const longestSide = Math.max(width, height);
  if (longestSide > 1800) {
    const ratio = 1800 / longestSide;
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
  }
  const canvas = document.createElement("canvas");
  let quality = .86;
  let result = src;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) break;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    result = canvas.toDataURL("image/webp", quality);
    if (result.length <= targetCharacters) break;
    width = Math.max(480, Math.round(width * .78));
    height = Math.max(480, Math.round(height * .78));
    quality = Math.max(.58, quality - .06);
  }
  canvas.width = 1;
  canvas.height = 1;
  return result.length < src.length ? result : src;
}

async function preparePdfHtml(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  const images = [...clone.querySelectorAll<HTMLImageElement>('img[src^="data:image/"]')];
  if (!images.length) return clone.outerHTML;
  // Vercel rejects request bodies above roughly 4.5 MB before the request can
  // reach our PDF service. Compress only this private transport copy; preview
  // and PNG continue to use the original full-resolution image assets.
  const imageBudget = 2_700_000;
  const perImageBudget = Math.max(64_000, Math.floor(imageBudget / images.length));
  await Promise.all(images.map(async (image) => {
    image.src = await compressImageForPdf(image.src, perImageBudget);
  }));
  return clone.outerHTML;
}

type PageSlice = { offset: number; end: number };
type LogicalPageRender = PageSlice & { canvas: HTMLCanvasElement };

async function measureDocumentPages(source: HTMLElement, config: ExportConfig): Promise<{ slices: PageSlice[]; totalHeight: number }> {
  const { width: pageWidth, height: pageHeight, margin } = pageGeometry(config);
  const printableWidth = pageWidth - margin * 2;
  const printableHeight = pageHeight - margin * 2;
  const usableHeight = printableHeight - 16;
  source.style.setProperty("--export-capture-width", `${printableWidth}px`);
  source.classList.add("export-capture");
  await waitForDocumentReady(source);
  const totalHeight = source.scrollHeight;
  const sourceTop = source.getBoundingClientRect().top;
  const elementBreaks = [...source.querySelectorAll(".conversation-exchange, .conversation-message, .conversation-message-content > *:not(:first-child), tr")]
    .map((element) => Math.round(element.getBoundingClientRect().top - sourceTop))
    .filter((position) => position > 0 && position < totalHeight);
  const lineBreaks = [...source.querySelectorAll(".conversation-message-content p, .conversation-message-content li, .conversation-message-content pre")]
    .flatMap((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const rects = [...range.getClientRects()].sort((a, b) => a.top - b.top || a.left - b.left);
      const lines: Array<{ top: number; bottom: number }> = [];
      for (const rect of rects) {
        const previous = lines.at(-1);
        if (previous && Math.abs(previous.top - rect.top) < 1.5) previous.bottom = Math.max(previous.bottom, rect.bottom);
        else lines.push({ top: rect.top, bottom: rect.bottom });
      }
      return lines.flatMap((line, index) => {
        if (index < 2 || lines.length - index < 2) return [];
        const previous = lines[index - 1];
        return line.top - previous.bottom >= 1 ? [Math.round((previous.bottom + line.top) / 2 - sourceTop)] : [];
      });
    });
  const safeBreaks = [...elementBreaks, ...lineBreaks].sort((a, b) => a - b);
  const protectedRanges = [...source.querySelectorAll(".conversation-message.user, pre, blockquote, table, .conversation-image, .math-display, img")]
    .map((element) => { const rect = element.getBoundingClientRect(); return { top: Math.round(rect.top - sourceTop), bottom: Math.round(rect.bottom - sourceTop) }; })
    .filter((range) => range.bottom - range.top < usableHeight);
  const slices: PageSlice[] = [];
  for (let offset = 0; offset < totalHeight;) {
    const idealEnd = Math.min(offset + usableHeight, totalHeight);
    const protectedAtEnd = protectedRanges.find((range) => range.top < idealEnd && range.bottom > idealEnd && range.top > offset + usableHeight * .3);
    const targetEnd = protectedAtEnd?.top || idealEnd;
    const earliestBreak = offset + Math.floor(usableHeight * .68);
    const safeEnd = safeBreaks.filter((position) => position >= earliestBreak && position <= targetEnd).at(-1);
    const end = idealEnd === totalHeight ? totalHeight : safeEnd || targetEnd;
    slices.push({ offset, end });
    offset = end;
  }
  return { slices, totalHeight };
}

async function renderDocumentPages(source: HTMLElement, config: ExportConfig, captureScale: number, onProgress?: (page: number, total: number) => void, pageLimit?: number): Promise<LogicalPageRender[]> {
  const { default: html2canvas } = await import("html2canvas");
  const { width: pageWidth, height: pageHeight, margin } = pageGeometry(config);
  const printableWidth = pageWidth - margin * 2;
  const { slices, totalHeight } = await measureDocumentPages(source, config);
  const pages: LogicalPageRender[] = [];
  const renderedSlices = pageLimit ? slices.slice(0, pageLimit) : slices;
  try {
    for (const { offset, end } of renderedSlices) {
    onProgress?.(pages.length + 1, renderedSlices.length);
    // Capture a small bleed before each continuation. The content begins 8px
    // inside the page window, so glyph ascenders cannot be clipped at its top.
    const captureOffset = Math.max(0, offset - 8);
    const sliceHeight = Math.max(1, end - captureOffset);
    const page = document.createElement("canvas");
    page.width = Math.ceil(pageWidth * captureScale);
    page.height = Math.ceil(pageHeight * captureScale);
    const context = page.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable.");
    const paperColor = source.dataset.appearance === "dark" ? "#202225" : "#fbfaf7";
    context.fillStyle = paperColor;
    context.fillRect(0, 0, page.width, page.height);
    const slice = await html2canvas(source, { scale: captureScale, backgroundColor: paperColor, useCORS: true, logging: false, x: 0, y: captureOffset, width: source.scrollWidth, height: sliceHeight, windowWidth: Math.max(1440, pageWidth), windowHeight: Math.max(1800, totalHeight), scrollX: 0, scrollY: 0 });
    context.drawImage(slice, 0, 0, slice.width, slice.height, margin * captureScale, (margin + 8 - (offset - captureOffset)) * captureScale, printableWidth * captureScale, sliceHeight * captureScale);
    if (config.composition === 1) {
      context.fillStyle = source.dataset.appearance === "dark" ? "#99968f" : "#8a8a85";
      context.font = `${9 * captureScale}px ${documentTheme.fontFamily}`;
      context.textAlign = "left";
      const footerBaseline = pageHeight - margin / 2;
      context.fillText("pAIcture", margin * captureScale, footerBaseline * captureScale);
      context.textAlign = "right";
      context.fillText(String(pages.length + 1), (pageWidth - margin) * captureScale, footerBaseline * captureScale);
    }
      pages.push({ canvas: page, offset, end });
    }
    return pages;
  } finally {
    source.classList.remove("export-capture");
    source.style.removeProperty("--export-capture-width");
  }
}

function composePageCanvases(logicalPages: LogicalPageRender[], perImage: PageComposition, config: ExportConfig) {
  const pages = logicalPages.map(({ canvas }) => canvas);
  if (perImage === 1) return pages;
  const groups: HTMLCanvasElement[] = [];
  const totalGroups = Math.ceil(pages.length / perImage);
  for (let start = 0; start < pages.length; start += perImage) {
    const items = pages.slice(start, start + perImage);
    const pageWidth = pages[0].width;
    const pageHeight = pages[0].height;
    const captureScale = pageWidth / pageGeometry(config).width;
    const margin = Math.round(pageGeometry(config).margin * captureScale);
    const gap = Math.round(Math.min(pageWidth, pageHeight) * .018);
    const columns = perImage === 4 ? 2 : config.orientation === "landscape" ? 2 : 1;
    const rows = perImage === 4 ? 2 : config.orientation === "landscape" ? 1 : 2;
    const cellWidth = (pageWidth - margin * 2 - gap * (columns - 1)) / columns;
    const cellHeight = (pageHeight - margin * 2 - gap * (rows - 1)) / rows;
    const pageScale = Math.min(cellWidth / pageWidth, cellHeight / pageHeight);
    const renderedWidth = pageWidth * pageScale;
    const renderedHeight = pageHeight * pageScale;
    const occupiedRows = Math.ceil(items.length / columns);
    const verticalOffset = (rows - occupiedRows) * (cellHeight + gap) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = pageWidth;
    canvas.height = pageHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image composition is unavailable.");
    const sample = pages[0].getContext("2d")?.getImageData(0, 0, 1, 1).data;
    context.fillStyle = sample ? `rgb(${sample[0]} ${sample[1]} ${sample[2]})` : "#fbfaf7";
    context.fillRect(0, 0, canvas.width, canvas.height);
    items.forEach((page, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const occupiedColumns = Math.min(columns, items.length - row * columns);
      const rowWidth = occupiedColumns * cellWidth + (occupiedColumns - 1) * gap;
      const rowOffset = (pageWidth - rowWidth) / 2;
      const x = rowOffset + column * (cellWidth + gap) + (cellWidth - renderedWidth) / 2;
      const y = margin + verticalOffset + row * (cellHeight + gap) + (cellHeight - renderedHeight) / 2;
      context.save();
      context.shadowColor = "rgba(40, 35, 30, .14)";
      context.shadowBlur = 5 * captureScale;
      context.shadowOffsetY = 2 * captureScale;
      context.drawImage(page, x, y, renderedWidth, renderedHeight);
      context.restore();
      context.strokeStyle = "rgba(100, 95, 88, .24)";
      context.lineWidth = Math.max(1, captureScale);
      context.strokeRect(x, y, renderedWidth, renderedHeight);
    });
    context.fillStyle = "#8a8a85";
    context.font = `${9 * captureScale}px ${documentTheme.fontFamily}`;
    context.textAlign = "left";
    const footerBaseline = pageHeight - margin / 2;
    context.fillText("pAIcture", margin, footerBaseline);
    context.textAlign = "right";
    context.fillText(`${groups.length + 1} / ${totalGroups}`, pageWidth - margin, footerBaseline);
    groups.push(canvas);
  }
  return groups;
}

function exchangePreview(messages: Message[], limit = 150) {
  const text = messages.map((message) => message.html)
    .join(" ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [importStage, setImportStage] = useState<JourneyStage>("reading");
  const [error, setError] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [selectedExchangeIds, setSelectedExchangeIds] = useState<string[]>([]);
  const [format, setFormat] = useState<"pdf" | "images">("pdf");
  const [documentAppearance, setDocumentAppearance] = useState<"light" | "dark">("light");
  const [paper, setPaper] = useState<PaperSize>("a4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [composition, setComposition] = useState<PageComposition>(1);
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [previewTotalPages, setPreviewTotalPages] = useState(0);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewRendering, setPreviewRendering] = useState(false);
  const [previewFit, setPreviewFit] = useState<"page" | "width">("width");
  const [exporting, setExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<"idle" | "rendering" | "downloading" | "done" | "error">("idle");
  const [exportDetail, setExportDetail] = useState("");
  const [exportError, setExportError] = useState("");
  const [readyDownload, setReadyDownload] = useState<{ href: string; filename: string } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const exportConfig = useMemo<ExportConfig>(() => ({ paper, orientation, composition }), [paper, orientation, composition]);
  const detected = useMemo(() => detectPlatform(url.trim()), [url]);
  const exchanges = useMemo(() => groupConversationExchanges(conversation?.messages || []), [conversation]);
  const selectedMessages = useMemo(
    () => messagesForSelectedExchanges(exchanges, selectedExchangeIds),
    [exchanges, selectedExchangeIds],
  );
  const [documentDate] = useState(() => new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric" }).format(new Date()));

  useEffect(() => () => { if (readyDownload) URL.revokeObjectURL(readyDownload.href); }, [readyDownload]);
  useEffect(() => { setReadyDownload(null); setExportPhase("idle"); }, [selectedMessages, format, documentAppearance, exportConfig]);

  useEffect(() => {
    const saved = localStorage.getItem("paicture-theme");
    const preferred = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    queueMicrotask(() => setTheme(preferred));
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("paicture-theme", theme); }, [theme]);
  useEffect(() => {
    localStorage.setItem("paicture-export-config", JSON.stringify({ ...exportConfig, appearance: documentAppearance }));
  }, [exportConfig, documentAppearance]);
  useEffect(() => {
    let handled = false;
    const receiveExtensionImport = (event: MessageEvent) => {
      if (handled || event.source !== window || event.origin !== window.location.origin || event.data?.type !== extensionImportEvent) return;
      handled = true;
      const detail = event.data.detail as { ok?: boolean; payload?: unknown; error?: unknown } | undefined;
      if (!detail?.ok) {
        setError(typeof detail?.error === "string" ? detail.error : "The browser extension handoff could not be read.");
        setStatus("error");
        return;
      }
      const imported = conversationFromExtension(detail.payload);
      if (!imported) {
        setError("The browser extension sent an invalid or unsupported conversation payload.");
        setStatus("error");
        return;
      }
      const importedExchanges = groupConversationExchanges(imported.messages);
      if (!importedExchanges.length) {
        setError("The rendered page did not contain a complete question-and-answer exchange.");
        setStatus("error");
        return;
      }
      setError("");
      setUrl("");
      setConversation(imported);
      setSelectedExchangeIds(importedExchanges.map((exchange) => exchange.id));
      setImportStage("ready");
      setStatus("ready");
      requestAnimationFrame(() => document.querySelector("#preview")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    window.addEventListener("message", receiveExtensionImport);
    return () => window.removeEventListener("message", receiveExtensionImport);
  }, []);
  useEffect(() => {
    if (!selectedMessages.length || !previewRef.current) { setPreviewPages([]); setPreviewTotalPages(0); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPreviewRendering(true);
      setPreviewPages([]);
      try {
        // Preview pixels are display-only. A lower fixed scale keeps every page
        // affordable on iOS without changing document geometry or pagination.
        const { slices } = await measureDocumentPages(previewRef.current!, exportConfig);
        const totalOutputPages = Math.ceil(slices.length / composition);
        const logicalPageLimit = previewExpanded ? undefined : 3 * composition;
        const logicalPages = await renderDocumentPages(previewRef.current!, exportConfig, .65, undefined, logicalPageLimit);
        const finalPages = composePageCanvases(logicalPages, composition, exportConfig);
        if (cancelled) return;
        const previews = finalPages.map((page) => page.toDataURL("image/jpeg", .82));
        logicalPages.forEach(({ canvas }) => { canvas.width = 1; canvas.height = 1; });
        finalPages.forEach((canvas) => { canvas.width = 1; canvas.height = 1; });
        setPreviewTotalPages(totalOutputPages);
        setPreviewPages(previews);
      } catch (reason) {
        console.error("[PREVIEW] Page rendering failed", reason);
      } finally { if (!cancelled) setPreviewRendering(false); }
    }, 260);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [selectedMessages, documentAppearance, exportConfig, composition, previewExpanded]);

  async function processConversation(event: React.FormEvent) {
    event.preventDefault();
    if (!detected) { setError("Paste a public ChatGPT shared link beginning with https://chatgpt.com/share/"); setStatus("error"); return; }
    setStatus("loading"); setError(""); setConversation(null); setSelectedExchangeIds([]); setImportStage("reading");
    try {
      const imported = await requestConversation(url);
      setImportStage("organizing");
      const importedExchanges = groupConversationExchanges(imported.messages);
      setImportStage("building");
      setConversation(imported);
      setSelectedExchangeIds(importedExchanges.length ? [importedExchanges.at(-1)!.id] : []);
      // A shared URL is sensitive user input. Keep it only long enough to import
      // the conversation and never leave it visible for the next person using
      // the same browser or device.
      setUrl("");
      setImportStage("ready"); setStatus("ready");
      requestAnimationFrame(() => document.querySelector("#preview")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (reason) {
      const networkFailure = reason instanceof TypeError || (reason instanceof DOMException && reason.name === "AbortError");
      setError(networkFailure ? "The mobile connection was interrupted before the import finished. Keep this page open and try again on a stable network." : reason instanceof Error ? reason.message : "We could not read this conversation.");
      setStatus("error");
    }
  }

  async function exportDocument() {
    if (!conversation || !previewRef.current || !selectedMessages.length) {
      setExportError("Select at least one complete question and answer before exporting.");
      setExportPhase("error");
      return;
    }
    setExporting(true);
    setExportPhase("rendering");
    setExportDetail("Preparing document…");
    setExportError("");
    console.info("[EXPORT] Download clicked", { format });
    try {
      const slug = exportFilename(conversation.title);
      const source = previewRef.current;
      const geometry = pageGeometry(exportConfig);
      source.style.setProperty("--export-capture-width", `${geometry.width - geometry.margin * 2}px`);
      source.classList.add("export-capture");
      console.info("[EXPORT] Rendering conversation");
      await waitForDocumentReady(source);
      console.info("[EXPORT] Render ready");
      if (format === "pdf") {
        setExportDetail("Paginating…");
        const { slices, totalHeight } = await measureDocumentPages(source, exportConfig);
        setExportDetail("Optimizing images for PDF…");
        const exportHtml = await preparePdfHtml(source);
        if (exportHtml.length > 3_600_000) {
          throw new Error("This image-heavy conversation is too large for one mobile PDF request. Select fewer exchanges and try again.");
        }
        setExportDetail("Creating PDF…");
        const pdfConfig = { ...exportConfig, sourceHeight: totalHeight, slices };
        if (isMobileBrowser()) {
          setExportPhase("downloading");
          setExportDetail("Opening PDF…");
          submitPdfToNativeViewer(exportHtml, pdfConfig, `${slug}.pdf`);
          return;
        }
        const pdfController = new AbortController();
        const pdfTimeout = window.setTimeout(() => pdfController.abort(), 125_000);
        const response = await fetch("/api/export/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html: exportHtml, config: pdfConfig, filename: `${slug}.pdf` }),
          signal: pdfController.signal,
        }).finally(() => window.clearTimeout(pdfTimeout));
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          const message = response.status === 413
            ? "This image-heavy conversation exceeded the PDF transfer limit. Select fewer exchanges and try again."
            : payload?.error || "Unable to generate this PDF right now.";
          throw new Error(message);
        }
        const blob = await response.blob();
        if (!blob.size || !blob.type.includes("pdf")) throw new Error("The PDF service returned an invalid file.");
        console.info("[EXPORT] PDF Blob generated", { size: blob.size, type: blob.type });
        setExportPhase("downloading");
        setExportDetail("Sending to downloads…");
        setReadyDownload({ href: downloadBlob(blob, `${slug}.pdf`), filename: `${slug}.pdf` });
        setExportPhase("done");
        setExportDetail("Ready");
        console.info("[EXPORT] Download triggered", { filename: `${slug}.pdf` });
        return;
      }
      const captureScale = 2;
      const logicalPages = await renderDocumentPages(source, exportConfig, captureScale, (page, total) => setExportDetail(`Rendering page ${page} of ${total}…`));
      const outputs = composePageCanvases(logicalPages, composition, exportConfig);
      const maxBytes = Math.max(...outputs.map((page) => page.width * page.height * 4));
      if (maxBytes > 420_000_000) throw new Error("This page composition would exceed the browser's safe image memory limit. Choose fewer pages per image or a smaller paper size.");
      console.info("[PNG] Paginated render complete", { pages: logicalPages.length, outputs: outputs.length, scale: captureScale, config: exportConfig });
      const pngFiles: Record<string, Uint8Array> = {};
      for (let page = 0; page < outputs.length; page++) {
        const blob = await new Promise<Blob | null>((resolve) => outputs[page].toBlob(resolve, "image/png"));
        if (!blob) throw new Error("PNG encoding failed.");
        pngFiles[`${slug}-${String(page + 1).padStart(3, "0")}.png`] = new Uint8Array(await blob.arrayBuffer());
      }
      setExportPhase("downloading");
      setExportDetail("Sending to downloads…");
      if (outputs.length === 1) {
        const file = pngFiles[Object.keys(pngFiles)[0]];
        const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
        setReadyDownload({ href: downloadBlob(new Blob([bytes], { type: "image/png" }), `${slug}.png`), filename: `${slug}.png` });
      } else {
        const { zipSync } = await import("fflate");
        const archive = zipSync(pngFiles, { level: 6 });
        setReadyDownload({ href: downloadBlob(new Blob([archive.buffer as ArrayBuffer], { type: "application/zip" }), `${slug}-images.zip`), filename: `${slug}-images.zip` });
      }
      setExportPhase("done");
      setExportDetail("Ready");
      console.info("[EXPORT] Download triggered", { pages: logicalPages.length, files: outputs.length });
    } catch (reason) {
      const timedOut = reason instanceof DOMException && reason.name === "AbortError";
      const message = timedOut
        ? "PDF generation took too long. Try fewer selected exchanges or a smaller page composition."
        : reason instanceof Error ? reason.message : "The export could not be generated.";
      console.error("[EXPORT] Failed", reason);
      setExportError(message);
      setExportPhase("error");
      setExportDetail("");
    } finally {
      previewRef.current?.classList.remove("export-capture");
      previewRef.current?.style.removeProperty("--export-capture-width");
      setExporting(false);
    }
  }

  function updateSelection(next: string[]) {
    setSelectedExchangeIds(next);
    setPreviewExpanded(false);
    setExportPhase("idle");
    setExportError("");
  }

  function toggleExchange(exchange: ConversationExchange) {
    updateSelection(selectedExchangeIds.includes(exchange.id)
      ? selectedExchangeIds.filter((id) => id !== exchange.id)
      : [...selectedExchangeIds, exchange.id]);
  }

  return <main className="workshop-app">
    <header className="site-header"><a className="brand" href="#top" aria-label="pAIcture home"><span className="brand-mark">p</span><span>pAIcture</span></a><button className="theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}><Sun size={16} /><span className="toggle-track"><span className="toggle-thumb" /></span><Moon size={16} /></button></header>
    <section id="top" className="hero">
      <div className="hero-decor" aria-hidden="true"><ChatBubble3D className="hero-bubble" /><FloatingPage className="hero-page" /><Sparkle className="hero-sparkle-one" /><Sparkle className="hero-sparkle-two" /></div>
      <div className="eyebrow"><WandSparkles size={14} /> A little workshop for your conversations</div>
      <h1>Turn conversations<br />into <em>little books.</em></h1>
      <p className="hero-copy">Bring a ChatGPT conversation. We’ll gather the words, arrange the pages, and turn it into a beautiful document you can keep.</p>
      <div className="hero-book" aria-hidden="true"><DocumentStack complete={status === "ready"} /></div>
      <form className={`link-card ${detected ? "has-platform" : ""}`} onSubmit={processConversation}>
        <div className="link-card-heading"><span className="tray-icon"><Link2 /></span><span><label htmlFor="conversation-url">Drop in your conversation link</label><small>Public ChatGPT share links work best</small></span></div>
        <div className={`url-field ${status === "error" ? "invalid" : ""}`}><input id="conversation-url" name="paicture-share-url" value={url} onChange={(event) => { setUrl(event.target.value); if (status === "error") setStatus("idle"); }} placeholder="https://chatgpt.com/share/…" autoComplete="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" />{detected && <span className="detected"><span>{platforms[detected].mark}</span>{platforms[detected].name}<Check size={14} /></span>}<button type="submit" disabled={status === "loading"} aria-label="Create my document">{status === "loading" ? <LoaderCircle className="spin" size={20} /> : <><span>Create my document</span><ArrowRight size={20} /></>}</button></div>
        <p className="paste-help">In ChatGPT, choose <strong>Share → Create link → Copy link</strong>. No ChatGPT login or password is required here; private <code>/c/</code> links aren’t supported.</p>
        {status === "loading" && <ProgressJourney stage={importStage} />}
        {status === "error" && <div className="error-note"><EmptyDocumentVisual /><span><strong>We couldn’t read this conversation.</strong><small>{error}</small></span><button type="button" onClick={() => { setStatus("idle"); setError(""); }}>Try another link</button></div>}
        <div className="supported"><span>Works with</span><div className={detected ? "recognized" : ""}><i>{platforms.chatgpt.mark}</i>ChatGPT {detected && <Check size={13} />}</div><div>Public shared conversations</div></div>
      </form>
      <div className="trust-row"><span><ShieldCheck size={17} />Processed only when you ask</span><span><Check size={17} />Formatting preserved</span><span><Check size={17} />Nothing added to a public gallery</span></div>
    </section>
    {conversation ? <section id="preview" className="workspace"><div className="workspace-heading"><div><span className="section-index">01 / Select</span><h2>Choose what to export</h2><p>Select complete question-and-answer exchanges. Your preview updates immediately.</p></div><div className="platform-pill"><span>{platforms[conversation.platform].mark}</span>{platforms[conversation.platform].name}</div></div>
      {conversation.warnings?.length ? <div className="warning"><strong>Import note</strong>{conversation.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : null}
      {exchanges.length ? <section className="exchange-selector" aria-labelledby="exchange-selector-title"><div className="exchange-selector-head"><div><h3 id="exchange-selector-title">Choose Q&amp;A exchanges</h3><p><strong>{selectedExchangeIds.length}</strong> of {exchanges.length} selected · Complete answers are always exported.</p></div><div className="exchange-actions"><button type="button" onClick={() => updateSelection(exchanges.map(({ id }) => id))}>Select all</button><button type="button" onClick={() => updateSelection([])}>Clear all</button><button type="button" onClick={() => updateSelection([exchanges.at(-1)!.id])}>Latest only</button></div></div><div className="exchange-list">{exchanges.map((exchange) => { const selected = selectedExchangeIds.includes(exchange.id); return <label className={`exchange-option ${selected ? "selected" : ""}`} key={exchange.id}><input type="checkbox" checked={selected} onChange={() => toggleExchange(exchange)} /><span className="exchange-number">{String(exchange.index).padStart(2, "0")}</span><span className="exchange-copy"><strong>{exchangePreview(exchange.userMessages) || "Question"}</strong><small>{exchangePreview(exchange.assistantMessages) || "Answer"}</small></span><span className="exchange-check" aria-hidden="true">{selected ? <Check size={16} /> : null}</span></label>; })}</div></section> : <div className="selection-warning" role="alert"><strong>No complete Q&amp;A exchange was found.</strong><span>pAIcture will not export the full conversation automatically. Try another complete shared conversation.</span></div>}
      <div className="preview-shell">
        <div className="preview-column">
          <div className="preview-label"><span className="section-index">02 / Final Preview</span><span>{selectedMessages.length ? `${previewTotalPages || "…"} output ${format === "pdf" ? "page" : "image"}${previewTotalPages === 1 ? "" : "s"} · ${paperSizes[paper].label} ${orientation} · ${composition}-in-1` : "Nothing selected"}</span>{selectedMessages.length ? <span className="preview-fit-controls" aria-label="Preview zoom"><button type="button" className={previewFit === "page" ? "selected" : ""} onClick={() => setPreviewFit("page")}>Fit page</button><button type="button" className={previewFit === "width" ? "selected" : ""} onClick={() => setPreviewFit("width")}>Fit width</button></span> : null}</div>
          {selectedMessages.length ? <>
            <div className="export-source-host" aria-hidden="true"><ConversationDocument ref={previewRef} title={conversation.title} platformName={platforms[conversation.platform].name} messages={selectedMessages} dateLabel={documentDate} appearance={documentAppearance} /></div>
            <div className={`page-preview-stage fit-${previewFit}`}>
              {previewRendering ? <div className="preview-rendering"><LoaderCircle className="spin" /><strong>Arranging the final pages…</strong></div> : <><div className="page-preview-list">{previewPages.map((src, index) => <figure className="page-preview" key={`${src.slice(-32)}-${index}`}><figcaption>{format === "pdf" ? "Output page" : "Image"} {index + 1}</figcaption><img src={src} alt={`Final ${format === "pdf" ? "PDF page" : "PNG image"} ${index + 1}`} /></figure>)}</div>{previewTotalPages > 3 ? <button type="button" className="preview-page-toggle" aria-expanded={previewExpanded} onClick={() => setPreviewExpanded((expanded) => !expanded)}>{previewExpanded ? "Collapse to first 3 pages" : `Expand all ${previewTotalPages} pages`}</button> : null}</>}
            </div>
          </> : <div className="empty-preview"><EmptyDocumentVisual /><strong>Your conversation will appear here.</strong><span>Select at least one Q&amp;A exchange to build the preview.</span></div>}
        </div>
        <aside className={`export-panel ${exportPhase === "done" ? "is-complete" : ""}`}>
          <span className="section-index">03 / Export Studio</span>
          <h3>Choose your format</h3><div className="format-grid"><button type="button" className={format === "pdf" ? "selected" : ""} onClick={() => { setFormat("pdf"); setExportPhase("idle"); setExportError(""); }}><span className="format-icon"><FileText /></span><span><strong>PDF</strong><small>Sharp, selectable text</small></span><i>{format === "pdf" && <Check size={15} />}</i></button><button type="button" className={format === "images" ? "selected" : ""} onClick={() => { setFormat("images"); setExportPhase("idle"); setExportError(""); }}><span className="format-icon"><FileImage /></span><span><strong>PNG</strong><small>High-resolution pages</small></span><i>{format === "images" && <Check size={15} />}</i></button></div>
          {exportPhase === "done" ? <div className="completion-card"><DocumentStack complete compact /><Sparkle /><h3>Your document is ready.</h3><p>The download has started in your browser.</p></div> : null}
          <details className="customize" open>
            <summary><span>{paperSizes[paper].label} · {orientation === "portrait" ? "Portrait" : "Landscape"} · {documentAppearance === "light" ? "Light" : "Dark"}</span><span>Setup <ChevronDown size={14} /></span></summary>
            <div className="export-customization">
              <p>Every change updates the paginated preview automatically.</p>
              <fieldset><legend>Appearance</legend><button type="button" className={documentAppearance === "light" ? "selected" : ""} onClick={() => setDocumentAppearance("light")}>Light</button><button type="button" className={documentAppearance === "dark" ? "selected" : ""} onClick={() => setDocumentAppearance("dark")}>Dark</button></fieldset>
              <fieldset><legend>Paper</legend>{(Object.keys(paperSizes) as PaperSize[]).map((size) => <button type="button" key={size} className={paper === size ? "selected" : ""} onClick={() => setPaper(size)}>{paperSizes[size].label}</button>)}</fieldset>
              <fieldset><legend>Orientation</legend><button type="button" className={orientation === "portrait" ? "selected" : ""} onClick={() => setOrientation("portrait")}>Portrait</button><button type="button" className={orientation === "landscape" ? "selected" : ""} onClick={() => setOrientation("landscape")}>Landscape</button></fieldset>
              <fieldset><legend>Logical pages per output</legend>{([1, 2, 4] as PageComposition[]).map((count) => <button type="button" key={count} className={composition === count ? "selected" : ""} onClick={() => setComposition(count)}>{count} in 1</button>)}</fieldset>
              <p className="quality-note"><Check size={13} /> High quality · balanced 1:1 margins</p>
            </div>
          </details>
          {readyDownload && exportPhase === "done" ? <a className="export-button" href={readyDownload.href} download={readyDownload.filename}><Download size={18} />Download {format === "pdf" ? "PDF" : "images"}</a> : <button type="button" className="export-button" onClick={exportDocument} disabled={exporting || previewRendering || !selectedMessages.length}>{exporting ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />}{exporting ? exportDetail || `Building ${format === "pdf" ? "your PDF" : "your images"}…` : previewRendering ? "Preparing preview…" : `Create ${format === "pdf" ? "PDF" : "PNG images"}`}</button>}
          {exporting && <ProgressJourney stage={exportPhase === "downloading" ? "ready" : "building"} />}{exportError && <p className="export-error" role="alert">{exportError}</p>}<p className="export-status" aria-live="polite">{exportPhase === "done" ? "Your browser download has started." : exporting ? exportDetail || "Keep this tab open while the pages are prepared." : !selectedMessages.length ? "Select content above to enable export." : ""}</p><p className="privacy-note"><ShieldCheck size={15} />Your imported content is not saved to a public library.</p>
        </aside>
      </div></section>
      : <section className="process"><div className="process-intro"><span className="section-index">The tiny document workshop</span><h2>From a chat to something you can keep.</h2></div><div className="process-grid"><article><span className="process-visual"><ChatBubble3D /></span><b>01</b><h3>Share it</h3><p>Create a public link for your ChatGPT conversation.</p></article><article><span className="process-visual"><FloatingPage /></span><b>02</b><h3>Arrange it</h3><p>Choose the questions and answers you want to keep.</p></article><article><span className="process-visual"><DocumentStack compact /></span><b>03</b><h3>Take it with you</h3><p>Download a polished PDF or crisp image pages.</p></article></div></section>}
    <footer><a className="brand" href="#top"><span className="brand-mark">p</span><span>pAIcture</span></a><p>Make AI conversations portable.</p><span>© 2026 pAIcture</span></footer>
  </main>;
}
