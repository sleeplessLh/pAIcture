"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Download, FileImage, FileText, Link2, LoaderCircle, Moon, ShieldCheck, Sun, WandSparkles } from "lucide-react";
import { ConversationDocument } from "@/components/conversation-document";
import { ChatBubble3D, DocumentStack, EmptyDocumentVisual, FloatingPage, ProgressJourney, Sparkle, type JourneyStage } from "@/components/workshop-visuals";
import { documentTheme } from "@/lib/document-theme";
import { groupConversationExchanges, messagesForSelectedExchanges, type ConversationExchange } from "@/lib/conversation/exchanges";

type Platform = "chatgpt";
type Message = { id: string; role: "user" | "assistant"; html: string };
type Conversation = { title: string; platform: Platform; messages: Message[]; warnings?: string[] };
const platforms: Record<Platform, { name: string; mark: string }> = { chatgpt: { name: "ChatGPT", mark: "◎" } };

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
  const [exporting, setExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<"idle" | "rendering" | "downloading" | "done" | "error">("idle");
  const [exportError, setExportError] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
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
      source.classList.add("export-capture");
      console.info("[EXPORT] Rendering conversation");
      await waitForDocumentReady(source);
      console.info("[EXPORT] Render ready");
      if (format === "pdf") {
        const response = await fetch("/api/export/pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html: source.outerHTML }),
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
      const { default: html2canvas } = await import("html2canvas");
      const { width: pageWidth, height: pageHeight, marginTop, marginX, marginBottom } = documentTheme.page;
      const printableHeight = pageHeight - marginTop - marginBottom;
      const totalHeight = source.scrollHeight;
      const captureScale = 2;
      const pages = [] as HTMLCanvasElement[];
      const sourceTop = source.getBoundingClientRect().top;
      const elementBreaks = [...source.querySelectorAll(".conversation-message, .conversation-message-content > *:not(:first-child), tr")]
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
      const protectedRanges = [...source.querySelectorAll("pre, blockquote, table, img")]
        .map((element) => { const rect = element.getBoundingClientRect(); return { top: Math.round(rect.top - sourceTop), bottom: Math.round(rect.bottom - sourceTop) }; })
        .filter((range) => range.bottom - range.top < printableHeight);
      for (let offset = 0; offset < totalHeight;) {
        const idealEnd = Math.min(offset + printableHeight, totalHeight);
        const protectedAtEnd = protectedRanges.find((range) => range.top < idealEnd && range.bottom > idealEnd && range.top > offset + printableHeight * .35);
        const targetEnd = protectedAtEnd?.top || idealEnd;
        const earliestBreak = offset + Math.floor(printableHeight * 0.72);
        const safeEnd = safeBreaks.filter((position) => position >= earliestBreak && position <= targetEnd).at(-1);
        const end = idealEnd === totalHeight ? totalHeight : safeEnd || targetEnd;
        const sliceHeight = end - offset;
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(pageWidth * captureScale);
        canvas.height = Math.ceil(pageHeight * captureScale);
        const context = canvas.getContext("2d");
        if (context) {
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          const slice = await html2canvas(source, {
            scale: captureScale,
            backgroundColor: "#ffffff",
            useCORS: true,
            logging: false,
            // html2canvas crops relative to the requested element. Adding the
            // document's page coordinates here skips content and clips the left edge.
            x: 0,
            y: offset,
            width: source.scrollWidth,
            height: sliceHeight,
            windowWidth: document.documentElement.scrollWidth,
            windowHeight: Math.max(document.documentElement.scrollHeight, totalHeight),
            scrollX: 0,
            scrollY: 0,
          });
          context.drawImage(slice, 0, 0, slice.width, slice.height, marginX * captureScale, marginTop * captureScale, pageWidth * captureScale - marginX * captureScale * 2, sliceHeight * captureScale);
          context.fillStyle = "#9a9a95";
          context.font = `${10 * captureScale}px ${documentTheme.fontFamily}`;
          context.textAlign = "left";
          context.fillText("pAIcture", marginX * captureScale, (pageHeight - 24) * captureScale);
          context.textAlign = "right";
          context.fillText(String(pages.length + 1), (pageWidth - marginX) * captureScale, (pageHeight - 24) * captureScale);
        }
        pages.push(canvas);
        offset = end;
      }
      console.info("[PNG] Paginated render complete", { pages: pages.length, sourceHeight: totalHeight, scale: captureScale });
      const pngFiles: Record<string, Uint8Array> = {};
      for (let page = 0; page < pages.length; page++) {
        const blob = await new Promise<Blob | null>((resolve) => pages[page].toBlob(resolve, "image/png"));
        if (!blob) throw new Error("PNG encoding failed.");
        pngFiles[`${slug}-${String(page + 1).padStart(3, "0")}.png`] = new Uint8Array(await blob.arrayBuffer());
      }
      setExportPhase("downloading");
      if (pages.length === 1) {
        const file = pngFiles[Object.keys(pngFiles)[0]];
        const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
        downloadBlob(new Blob([bytes], { type: "image/png" }), `${slug}.png`);
      } else {
        const { zipSync } = await import("fflate");
        const archive = zipSync(pngFiles, { level: 6 });
        downloadBlob(new Blob([archive.buffer as ArrayBuffer], { type: "application/zip" }), `${slug}-images.zip`);
      }
      setExportPhase("done");
      console.info("[EXPORT] Download triggered", { pages: pages.length });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The export could not be generated.";
      console.error("[EXPORT] Failed", reason);
      setExportError(message);
      setExportPhase("error");
    } finally { previewRef.current?.classList.remove("export-capture"); setExporting(false); }
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
      <div className="preview-shell"><div className="preview-column"><div className="preview-label"><span className="section-index">02 / Preview</span><span>{selectedMessages.length ? `${selectedExchangeIds.length} exchange${selectedExchangeIds.length === 1 ? "" : "s"} selected` : "Nothing selected"}</span></div>{selectedMessages.length ? <div className="document-stage"><Sparkle className="preview-sparkle" /><div className="document-sheet"><ConversationDocument ref={previewRef} title={conversation.title} platformName={platforms[conversation.platform].name} messages={selectedMessages} dateLabel={documentDate} /></div></div> : <div className="empty-preview"><EmptyDocumentVisual /><strong>Your conversation will appear here.</strong><span>Select at least one Q&amp;A exchange to build the preview.</span></div>}</div>
      <aside className={`export-panel ${exportPhase === "done" ? "is-complete" : ""}`}><span className="section-index">03 / Export</span>{exportPhase === "done" ? <div className="completion-card"><DocumentStack complete compact /><Sparkle /><h3>Your document is ready.</h3><p>The download has started in your browser.</p></div> : <><h3>Choose your format</h3><div className="format-grid"><button type="button" className={format === "pdf" ? "selected" : ""} onClick={() => { setFormat("pdf"); setExportPhase("idle"); setExportError(""); }}><span className="format-icon"><FileText /></span><span><strong>PDF</strong><small>Best for reading</small></span><i>{format === "pdf" && <Check size={15} />}</i></button><button type="button" className={format === "images" ? "selected" : ""} onClick={() => { setFormat("images"); setExportPhase("idle"); setExportError(""); }}><span className="format-icon"><FileImage /></span><span><strong>PNG</strong><small>Best for sharing</small></span><i>{format === "images" && <Check size={15} />}</i></button></div></>}<details className="customize"><summary>Quality: High <span>Customize <ChevronDown size={14} /></span></summary><div><p>Exports use balanced margins, sharp text, and automatic multi-page layout.</p></div></details><button type="button" className="export-button" onClick={exportDocument} disabled={exporting || !selectedMessages.length}>{exporting ? <LoaderCircle className="spin" size={18} /> : exportPhase === "done" ? <Download size={18} /> : <Download size={18} />}{exporting ? exportPhase === "downloading" ? "Sending to downloads…" : `Building ${format === "pdf" ? "your PDF" : "your images"}…` : exportPhase === "done" ? `Download ${format === "pdf" ? "PDF" : "again"}` : `Create ${format === "pdf" ? "PDF" : "PNG images"}`}</button>{exporting && <ProgressJourney stage={exportPhase === "downloading" ? "ready" : "building"} />}{exportError && <p className="export-error" role="alert">{exportError}</p>}<p className="export-status" aria-live="polite">{exportPhase === "done" ? "Your browser download has started." : exporting ? "Keep this tab open while the pages are prepared." : !selectedMessages.length ? "Select content above to enable export." : ""}</p><p className="privacy-note"><ShieldCheck size={15} />Your imported content is not saved to a public library.</p></aside></div></section>
      : <section className="process"><div className="process-intro"><span className="section-index">The tiny document workshop</span><h2>From a chat to something you can keep.</h2></div><div className="process-grid"><article><span className="process-visual"><ChatBubble3D /></span><b>01</b><h3>Share it</h3><p>Create a public link for your ChatGPT conversation.</p></article><article><span className="process-visual"><FloatingPage /></span><b>02</b><h3>Arrange it</h3><p>Choose the questions and answers you want to keep.</p></article><article><span className="process-visual"><DocumentStack compact /></span><b>03</b><h3>Take it with you</h3><p>Download a polished PDF or crisp image pages.</p></article></div></section>}
    <footer><a className="brand" href="#top"><span className="brand-mark">p</span><span>pAIcture</span></a><p>Make AI conversations portable.</p><span>© 2026 pAIcture</span></footer>
  </main>;
}
