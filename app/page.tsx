"use client";
/* eslint-disable @next/next/no-img-element -- export previews are generated data URLs and must not pass through Next image optimization */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Download, FileImage, FileText, Link2, LoaderCircle, Moon, ShieldCheck, Sun, WandSparkles } from "lucide-react";
import { ConversationDocument } from "@/components/conversation-document";
import { ChatBubble3D, DocumentStack, EmptyDocumentVisual, FloatingPage, ProgressJourney, Sparkle, type JourneyStage } from "@/components/workshop-visuals";
import { documentTheme } from "@/lib/document-theme";
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
  a4: { label: "A4", width: 794, height: 1123, margin: 68 },
  a3: { label: "A3", width: 1123, height: 1587, margin: 82 },
  letter: { label: "Letter", width: 816, height: 1056, margin: 68 },
};

function pageGeometry(config: ExportConfig) {
  const paper = paperSizes[config.paper];
  const rotated = config.orientation === "landscape";
  return { width: rotated ? paper.height : paper.width, height: rotated ? paper.width : paper.height, margin: paper.margin };
}

function detectPlatform(value: string): Platform | null {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if (host === "chatgpt.com" && /^\/share\/[a-z0-9-]+\/?$/i.test(new URL(value).pathname)) return "chatgpt";
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
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

function exportFilename(title: string) {
  return title.normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/\s+/g, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 80) || "paicture-chatgpt-export";
}

async function renderDocumentPages(source: HTMLElement, config: ExportConfig, captureScale: number) {
  const { default: html2canvas } = await import("html2canvas");
  const { width: pageWidth, height: pageHeight, margin } = pageGeometry(config);
  const printableWidth = pageWidth - margin * 2;
  const printableHeight = pageHeight - margin * 2;
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
      const rect = element.getBoundingClientRect();
      const top = rect.top - sourceTop;
      const bottom = rect.bottom - sourceTop;
      const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
      if (!Number.isFinite(lineHeight) || rect.height < lineHeight * 3) return [];
      const positions: number[] = [];
      for (let position = top + lineHeight * 2; position < bottom - lineHeight; position += lineHeight) positions.push(Math.round(position));
      return positions;
    });
  const safeBreaks = [...elementBreaks, ...lineBreaks].sort((a, b) => a - b);
  const protectedRanges = [...source.querySelectorAll(".conversation-message.user, pre, blockquote, table, .conversation-image, img")]
    .map((element) => { const rect = element.getBoundingClientRect(); return { top: Math.round(rect.top - sourceTop), bottom: Math.round(rect.bottom - sourceTop) }; })
    .filter((range) => range.bottom - range.top < printableHeight);
  const pages: HTMLCanvasElement[] = [];
  for (let offset = 0; offset < totalHeight;) {
    const idealEnd = Math.min(offset + printableHeight, totalHeight);
    const protectedAtEnd = protectedRanges.find((range) => range.top < idealEnd && range.bottom > idealEnd && range.top > offset + printableHeight * .3);
    const targetEnd = protectedAtEnd?.top || idealEnd;
    const earliestBreak = offset + Math.floor(printableHeight * .68);
    const safeEnd = safeBreaks.filter((position) => position >= earliestBreak && position <= targetEnd).at(-1);
    const end = idealEnd === totalHeight ? totalHeight : safeEnd || targetEnd;
    const sliceHeight = Math.max(1, end - offset);
    const page = document.createElement("canvas");
    page.width = Math.ceil(pageWidth * captureScale);
    page.height = Math.ceil(pageHeight * captureScale);
    const context = page.getContext("2d");
    if (!context) throw new Error("Canvas rendering is unavailable.");
    const paperColor = source.dataset.appearance === "dark" ? "#202225" : "#fbfaf7";
    context.fillStyle = paperColor;
    context.fillRect(0, 0, page.width, page.height);
    const slice = await html2canvas(source, { scale: captureScale, backgroundColor: paperColor, useCORS: true, logging: false, x: 0, y: offset, width: source.scrollWidth, height: sliceHeight, windowWidth: document.documentElement.scrollWidth, windowHeight: Math.max(document.documentElement.scrollHeight, totalHeight), scrollX: 0, scrollY: 0 });
    context.drawImage(slice, 0, 0, slice.width, slice.height, margin * captureScale, margin * captureScale, printableWidth * captureScale, sliceHeight * captureScale);
    context.fillStyle = source.dataset.appearance === "dark" ? "#99968f" : "#8a8a85";
    context.font = `${9 * captureScale}px ${documentTheme.fontFamily}`;
    context.textAlign = "left";
    context.fillText("pAIcture", margin * captureScale, (pageHeight - 24) * captureScale);
    context.textAlign = "right";
    context.fillText(String(pages.length + 1), (pageWidth - margin) * captureScale, (pageHeight - 24) * captureScale);
    pages.push(page);
    offset = end;
  }
  source.classList.remove("export-capture");
  source.style.removeProperty("--export-capture-width");
  return pages;
}

function composePageCanvases(pages: HTMLCanvasElement[], perImage: PageComposition, config: ExportConfig) {
  if (perImage === 1) return pages;
  const groups: HTMLCanvasElement[] = [];
  for (let start = 0; start < pages.length; start += perImage) {
    const items = pages.slice(start, start + perImage);
    const pageWidth = pages[0].width;
    const pageHeight = pages[0].height;
    const gap = Math.round(Math.min(pageWidth, pageHeight) * .025);
    const padding = gap;
    const columns = perImage === 4 ? 2 : config.orientation === "portrait" ? 2 : 1;
    const rows = Math.ceil(items.length / columns);
    const canvas = document.createElement("canvas");
    canvas.width = padding * 2 + columns * pageWidth + (columns - 1) * gap;
    canvas.height = padding * 2 + rows * pageHeight + (rows - 1) * gap;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image composition is unavailable.");
    context.fillStyle = "#dedbd4";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const finalRowCount = items.length - (rows - 1) * columns;
    items.forEach((page, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const isFinalRow = row === rows - 1;
      const rowCount = isFinalRow ? finalRowCount : columns;
      const rowOffset = isFinalRow ? (columns - rowCount) * (pageWidth + gap) / 2 : 0;
      context.drawImage(page, padding + rowOffset + column * (pageWidth + gap), padding + row * (pageHeight + gap));
    });
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
  const [previewCompositions, setPreviewCompositions] = useState<string[]>([]);
  const [previewRendering, setPreviewRendering] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<"idle" | "rendering" | "downloading" | "done" | "error">("idle");
  const [exportError, setExportError] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const exportConfig = useMemo<ExportConfig>(() => ({ paper, orientation, composition }), [paper, orientation, composition]);
  const detected = useMemo(() => detectPlatform(url.trim()), [url]);
  const exchanges = useMemo(() => groupConversationExchanges(conversation?.messages || []), [conversation]);
  const selectedMessages = useMemo(
    () => messagesForSelectedExchanges(exchanges, selectedExchangeIds),
    [exchanges, selectedExchangeIds],
  );
  const [documentDate] = useState(() => new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric" }).format(new Date()));

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
    if (!selectedMessages.length || !previewRef.current) { setPreviewPages([]); setPreviewCompositions([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPreviewRendering(true);
      try {
        const pages = await renderDocumentPages(previewRef.current!, exportConfig, 1);
        if (cancelled) return;
        setPreviewPages(pages.map((page) => page.toDataURL("image/png")));
        setPreviewCompositions(format === "images" ? composePageCanvases(pages, composition, exportConfig).map((page) => page.toDataURL("image/jpeg", .82)) : []);
      } catch (reason) {
        console.error("[PREVIEW] Page rendering failed", reason);
      } finally { if (!cancelled) setPreviewRendering(false); }
    }, 260);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [selectedMessages, documentAppearance, exportConfig, format, composition]);

  async function processConversation(event: React.FormEvent) {
    event.preventDefault();
    if (!detected) { setError("Paste a public ChatGPT shared link beginning with https://chatgpt.com/share/"); setStatus("error"); return; }
    setStatus("loading"); setError(""); setConversation(null); setSelectedExchangeIds([]); setImportStage("reading");
    try {
      const response = await fetch("/api/import/chatgpt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
      setImportStage("organizing");
      const payload = await response.json() as Conversation & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to import this shared conversation.");
      const imported = payload as Conversation;
      const importedExchanges = groupConversationExchanges(imported.messages);
      setImportStage("building");
      setConversation(imported);
      setSelectedExchangeIds(importedExchanges.length ? [importedExchanges.at(-1)!.id] : []);
      setImportStage("ready"); setStatus("ready");
      requestAnimationFrame(() => document.querySelector("#preview")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not read this conversation."); setStatus("error"); }
  }

  async function exportDocument() {
    if (!conversation || !previewRef.current || !selectedMessages.length) {
      setExportError("Select at least one complete question and answer before exporting.");
      setExportPhase("error");
      return;
    }
    setExporting(true);
    setExportPhase("rendering");
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
        const response = await fetch("/api/export/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html: source.outerHTML, config: exportConfig }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error || "Unable to generate this PDF right now.");
        }
        const blob = await response.blob();
        if (!blob.size || !blob.type.includes("pdf")) throw new Error("The PDF service returned an invalid file.");
        console.info("[EXPORT] PDF Blob generated", { size: blob.size, type: blob.type });
        setExportPhase("downloading");
        downloadBlob(blob, `${slug}.pdf`);
        setExportPhase("done");
        console.info("[EXPORT] Download triggered", { filename: `${slug}.pdf` });
        return;
      }
      const captureScale = 2;
      const pages = await renderDocumentPages(source, exportConfig, captureScale);
      const outputs = composePageCanvases(pages, composition, exportConfig);
      const maxBytes = Math.max(...outputs.map((page) => page.width * page.height * 4));
      if (maxBytes > 420_000_000) throw new Error("This page composition would exceed the browser's safe image memory limit. Choose fewer pages per image or a smaller paper size.");
      console.info("[PNG] Paginated render complete", { pages: pages.length, outputs: outputs.length, scale: captureScale, config: exportConfig });
      const pngFiles: Record<string, Uint8Array> = {};
      for (let page = 0; page < outputs.length; page++) {
        const blob = await new Promise<Blob | null>((resolve) => outputs[page].toBlob(resolve, "image/png"));
        if (!blob) throw new Error("PNG encoding failed.");
        pngFiles[`${slug}-${String(page + 1).padStart(3, "0")}.png`] = new Uint8Array(await blob.arrayBuffer());
      }
      setExportPhase("downloading");
      if (outputs.length === 1) {
        const file = pngFiles[Object.keys(pngFiles)[0]];
        const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
        downloadBlob(new Blob([bytes], { type: "image/png" }), `${slug}.png`);
      } else {
        const { zipSync } = await import("fflate");
        const archive = zipSync(pngFiles, { level: 6 });
        downloadBlob(new Blob([archive.buffer as ArrayBuffer], { type: "application/zip" }), `${slug}-images.zip`);
      }
      setExportPhase("done");
      console.info("[EXPORT] Download triggered", { pages: pages.length, files: outputs.length });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The export could not be generated.";
      console.error("[EXPORT] Failed", reason);
      setExportError(message);
      setExportPhase("error");
    } finally {
      previewRef.current?.classList.remove("export-capture");
      previewRef.current?.style.removeProperty("--export-capture-width");
      setExporting(false);
    }
  }

  function updateSelection(next: string[]) {
    setSelectedExchangeIds(next);
    setExportPhase("idle");
    setExportError("");
  }

  function toggleExchange(exchange: ConversationExchange) {
    updateSelection(selectedExchangeIds.includes(exchange.id)
      ? selectedExchangeIds.filter((id) => id !== exchange.id)
      : [...selectedExchangeIds, exchange.id]);
  }

  return <main className="workshop-app">
    <header className="site-header"><a className="brand" href="#top" aria-label="pAIcture home"><span className="brand-mark">p</span><span>pAIcture</span></a><div className="header-meta"><span className="status-dot" /> Early workshop</div><button className="theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}><Sun size={16} /><span className="toggle-track"><span className="toggle-thumb" /></span><Moon size={16} /></button></header>
    <section id="top" className="hero">
      <div className="hero-decor" aria-hidden="true"><ChatBubble3D className="hero-bubble" /><FloatingPage className="hero-page" /><Sparkle className="hero-sparkle-one" /><Sparkle className="hero-sparkle-two" /></div>
      <div className="eyebrow"><WandSparkles size={14} /> A little workshop for your conversations</div>
      <h1>Turn conversations<br />into <em>little books.</em></h1>
      <p className="hero-copy">Bring a ChatGPT conversation. We’ll gather the words, arrange the pages, and turn it into a beautiful document you can keep.</p>
      <div className="hero-book" aria-hidden="true"><DocumentStack complete={status === "ready"} /></div>
      <form className={`link-card ${detected ? "has-platform" : ""}`} onSubmit={processConversation}>
        <div className="link-card-heading"><span className="tray-icon"><Link2 /></span><span><label htmlFor="conversation-url">Drop in your conversation link</label><small>Public ChatGPT share links work best</small></span></div>
        <div className={`url-field ${status === "error" ? "invalid" : ""}`}><input id="conversation-url" value={url} onChange={(event) => { setUrl(event.target.value); if (status === "error") setStatus("idle"); }} placeholder="https://chatgpt.com/share/…" autoComplete="url" />{detected && <span className="detected"><span>{platforms[detected].mark}</span>{platforms[detected].name}<Check size={14} /></span>}<button type="submit" disabled={status === "loading"} aria-label="Create my document">{status === "loading" ? <LoaderCircle className="spin" size={20} /> : <><span>Create my document</span><ArrowRight size={20} /></>}</button></div>
        <p className="paste-help">In ChatGPT, choose <strong>Share → Create link → Copy link</strong>. Private <code>/c/</code> links aren’t supported.</p>
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
          <div className="preview-label"><span className="section-index">02 / Preview</span><span>{selectedMessages.length ? `${previewPages.length || "…"} page${previewPages.length === 1 ? "" : "s"} · ${paperSizes[paper].label} ${orientation}` : "Nothing selected"}</span></div>
          {selectedMessages.length ? <>
            <div className="export-source-host" aria-hidden="true"><ConversationDocument ref={previewRef} title={conversation.title} platformName={platforms[conversation.platform].name} messages={selectedMessages} dateLabel={documentDate} appearance={documentAppearance} /></div>
            <div className="page-preview-stage">
              {previewRendering ? <div className="preview-rendering"><LoaderCircle className="spin" /><strong>Arranging the pages…</strong></div> : <div className="page-preview-list">{previewPages.map((src, index) => <figure className="page-preview" key={`${src.slice(-32)}-${index}`}><figcaption>Page {index + 1}</figcaption><img src={src} alt={`Export preview page ${index + 1}`} /></figure>)}</div>}
            </div>
            {format === "images" && composition > 1 && previewCompositions.length ? <section className="composition-preview"><div><strong>Final PNG composition</strong><span>{composition} pages per image · {previewCompositions.length} file{previewCompositions.length === 1 ? "" : "s"}</span></div><div>{previewCompositions.map((src, index) => <figure key={index}><figcaption>Image {index + 1}</figcaption><img src={src} alt={`Final PNG composition ${index + 1}`} /></figure>)}</div></section> : null}
          </> : <div className="empty-preview"><EmptyDocumentVisual /><strong>Your conversation will appear here.</strong><span>Select at least one Q&amp;A exchange to build the preview.</span></div>}
        </div>
        <aside className={`export-panel ${exportPhase === "done" ? "is-complete" : ""}`}>
          <span className="section-index">03 / Export Studio</span>
          {exportPhase === "done" ? <div className="completion-card"><DocumentStack complete compact /><Sparkle /><h3>Your document is ready.</h3><p>The download has started in your browser.</p></div> : <><h3>Choose your format</h3><div className="format-grid"><button type="button" className={format === "pdf" ? "selected" : ""} onClick={() => { setFormat("pdf"); setExportPhase("idle"); setExportError(""); }}><span className="format-icon"><FileText /></span><span><strong>PDF</strong><small>Sharp, selectable text</small></span><i>{format === "pdf" && <Check size={15} />}</i></button><button type="button" className={format === "images" ? "selected" : ""} onClick={() => { setFormat("images"); setExportPhase("idle"); setExportError(""); }}><span className="format-icon"><FileImage /></span><span><strong>PNG</strong><small>High-resolution pages</small></span><i>{format === "images" && <Check size={15} />}</i></button></div></>}
          <details className="customize" open>
            <summary><span>{paperSizes[paper].label} · {orientation === "portrait" ? "Portrait" : "Landscape"} · {documentAppearance === "light" ? "Light" : "Dark"}</span><span>Setup <ChevronDown size={14} /></span></summary>
            <div className="export-customization">
              <p>Every change updates the paginated preview automatically.</p>
              <fieldset><legend>Appearance</legend><button type="button" className={documentAppearance === "light" ? "selected" : ""} onClick={() => setDocumentAppearance("light")}>Light</button><button type="button" className={documentAppearance === "dark" ? "selected" : ""} onClick={() => setDocumentAppearance("dark")}>Dark</button></fieldset>
              <fieldset><legend>Paper</legend>{(Object.keys(paperSizes) as PaperSize[]).map((size) => <button type="button" key={size} className={paper === size ? "selected" : ""} onClick={() => setPaper(size)}>{paperSizes[size].label}</button>)}</fieldset>
              <fieldset><legend>Orientation</legend><button type="button" className={orientation === "portrait" ? "selected" : ""} onClick={() => setOrientation("portrait")}>Portrait</button><button type="button" className={orientation === "landscape" ? "selected" : ""} onClick={() => { setOrientation("landscape"); if (composition === 4) setComposition(2); }}>Landscape</button></fieldset>
              {format === "images" ? <fieldset><legend>Pages per PNG</legend>{([1, 2, ...(orientation === "portrait" ? [4] : [])] as PageComposition[]).map((count) => <button type="button" key={count} className={composition === count ? "selected" : ""} onClick={() => setComposition(count)}>{count} in 1</button>)}</fieldset> : null}
              <p className="quality-note"><Check size={13} /> High quality · balanced 1:1 margins</p>
            </div>
          </details>
          <button type="button" className="export-button" onClick={exportDocument} disabled={exporting || !selectedMessages.length}>{exporting ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />}{exporting ? exportPhase === "downloading" ? "Sending to downloads…" : `Building ${format === "pdf" ? "your PDF" : "your images"}…` : exportPhase === "done" ? `Download ${format === "pdf" ? "PDF" : "again"}` : `Create ${format === "pdf" ? "PDF" : "PNG images"}`}</button>
          {exporting && <ProgressJourney stage={exportPhase === "downloading" ? "ready" : "building"} />}{exportError && <p className="export-error" role="alert">{exportError}</p>}<p className="export-status" aria-live="polite">{exportPhase === "done" ? "Your browser download has started." : exporting ? "Keep this tab open while the pages are prepared." : !selectedMessages.length ? "Select content above to enable export." : ""}</p><p className="privacy-note"><ShieldCheck size={15} />Your imported content is not saved to a public library.</p>
        </aside>
      </div></section>
      : <section className="process"><div className="process-intro"><span className="section-index">The tiny document workshop</span><h2>From a chat to something you can keep.</h2></div><div className="process-grid"><article><span className="process-visual"><ChatBubble3D /></span><b>01</b><h3>Share it</h3><p>Create a public link for your ChatGPT conversation.</p></article><article><span className="process-visual"><FloatingPage /></span><b>02</b><h3>Arrange it</h3><p>Choose the questions and answers you want to keep.</p></article><article><span className="process-visual"><DocumentStack compact /></span><b>03</b><h3>Take it with you</h3><p>Download a polished PDF or crisp image pages.</p></article></div></section>}
    <footer><a className="brand" href="#top"><span className="brand-mark">p</span><span>pAIcture</span></a><p>Make AI conversations portable.</p><span>© 2026 pAIcture</span></footer>
  </main>;
}
