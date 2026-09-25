"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Download, FileImage, FileText, Link2, LoaderCircle, Moon, ShieldCheck, Sparkles, Sun } from "lucide-react";
import { ConversationDocument } from "@/components/conversation-document";
import { documentTheme } from "@/lib/document-theme";

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
  await Promise.all([...root.querySelectorAll("img")].map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  })));
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

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [format, setFormat] = useState<"pdf" | "images">("pdf");
  const [exporting, setExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<"idle" | "rendering" | "downloading" | "done" | "error">("idle");
  const [exportError, setExportError] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const detected = useMemo(() => detectPlatform(url.trim()), [url]);
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
    setStatus("loading"); setError(""); setConversation(null); setProgress(18);
    const timer = window.setInterval(() => setProgress((value) => Math.min(value + 9, 86)), 420);
    try {
      const response = await fetch("/api/import/chatgpt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
      const payload = await response.json() as Conversation & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to import this shared conversation.");
      const imported = payload as Conversation;
      setConversation(imported); setProgress(100); setStatus("ready");
      requestAnimationFrame(() => document.querySelector("#preview")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not read this conversation."); setStatus("error"); setProgress(0); }
    finally { clearInterval(timer); }
  }

  async function exportDocument() {
    if (!conversation || !previewRef.current) return;
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
        downloadBlob(new Blob([pngFiles[Object.keys(pngFiles)[0]]], { type: "image/png" }), `${slug}.png`);
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

  return <main>
    <header className="site-header"><a className="brand" href="#top" aria-label="pAIcture home"><span className="brand-mark">p</span><span>pAIcture</span></a><div className="header-meta"><span className="status-dot" /> Early access</div><button className="theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}><Sun size={16} /><span className="toggle-track"><span className="toggle-thumb" /></span><Moon size={16} /></button></header>
    <section id="top" className="hero"><div className="eyebrow"><Sparkles size={14} /> ChatGPT conversations, beautifully kept</div><h1>From ChatGPT<br />to <em>finished document.</em></h1><p className="hero-copy">Create a ChatGPT shared link, paste it here, review every message, then export a polished PDF or high-resolution image set.</p>
      <form className="link-card" onSubmit={processConversation}><label htmlFor="conversation-url">Paste a public ChatGPT shared link</label><div className={`url-field ${status === "error" ? "invalid" : ""}`}><Link2 size={20} /><input id="conversation-url" value={url} onChange={(event) => { setUrl(event.target.value); if (status === "error") setStatus("idle"); }} placeholder="https://chatgpt.com/share/…" autoComplete="url" />{detected && <span className="detected"><span>{platforms[detected].mark}</span>{platforms[detected].name}</span>}<button type="submit" disabled={status === "loading"}>{status === "loading" ? <LoaderCircle className="spin" size={20} /> : <ArrowRight size={20} />}</button></div><p className="paste-help">In ChatGPT, choose Share → Create link → Copy link. Private <code>/c/</code> conversation URLs are intentionally not supported.</p>
        {status === "loading" && <div className="progress-wrap"><div className="progress-line"><span style={{ width: `${progress}%` }} /></div><p>Reading the conversation and preserving its structure… <strong>{progress}%</strong></p></div>}
        {status === "error" && <div className="error-note"><strong>We couldn’t complete this import.</strong><span>{error}</span></div>}
        <div className="supported"><span>Current focus</span><div><i>{platforms.chatgpt.mark}</i>ChatGPT</div><div>Public shared conversations only</div></div></form>
      <div className="trust-row"><span><ShieldCheck size={17} />Processed only when you ask</span><span><Check size={17} />Formatting preserved</span><span><Check size={17} />No public gallery</span></div></section>
    {conversation ? <section id="preview" className="workspace"><div className="workspace-heading"><div><span className="section-index">01 / Preview</span><h2>Review before export</h2><p>Check every message, image, table, and code block before creating the final file.</p></div><div className="platform-pill"><span>{platforms[conversation.platform].mark}</span>{platforms[conversation.platform].name}</div></div>
      {conversation.warnings?.length ? <div className="warning"><strong>Import note</strong>{conversation.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : null}<div className="preview-shell"><div className="document-sheet"><ConversationDocument ref={previewRef} title={conversation.title} platformName={platforms[conversation.platform].name} messages={conversation.messages} dateLabel={documentDate} /></div>
      <aside className="export-panel"><span className="section-index">02 / Export</span><h3>Choose your format</h3><button type="button" className={format === "pdf" ? "selected" : ""} onClick={() => { setFormat("pdf"); setExportPhase("idle"); setExportError(""); }}><FileText size={22} /><span><strong>PDF document</strong><small>Sharp, selectable text</small></span>{format === "pdf" && <Check size={17} />}</button><button type="button" className={format === "images" ? "selected" : ""} onClick={() => { setFormat("images"); setExportPhase("idle"); setExportError(""); }}><FileImage size={22} /><span><strong>PNG images</strong><small>High-resolution, split when needed</small></span>{format === "images" && <Check size={17} />}</button><div className="quality"><span>Quality</span><button type="button">High <ChevronDown size={14} /></button></div><button type="button" className="export-button" onClick={exportDocument} disabled={exporting}>{exporting ? <LoaderCircle className="spin" size={18} /> : exportPhase === "done" ? <Check size={18} /> : <Download size={18} />}{exporting ? exportPhase === "downloading" ? "Downloading…" : `Generating ${format === "pdf" ? "PDF" : "PNG"}…` : exportPhase === "done" ? "Download started" : `Export ${format === "pdf" ? "PDF" : "images"}`}</button>{exportError && <p className="export-error" role="alert">{exportError}</p>}<p className="export-status" aria-live="polite">{exportPhase === "done" ? "Your browser download has started." : exporting ? "Please keep this tab open while the document is prepared." : ""}</p><p className="privacy-note"><ShieldCheck size={15} />Your imported content is not saved to a public library.</p></aside></div></section>
      : <section className="process"><span className="section-index">How it works</span><div className="process-grid"><article><b>01</b><h2>Share</h2><p>Open a ChatGPT conversation and create its public shared link.</p></article><article><b>02</b><h2>Import</h2><p>Paste the link so pAIcture can reconstruct the structured conversation.</p></article><article><b>03</b><h2>Export</h2><p>Review every turn, then download a PDF or high-resolution PNG pages.</p></article></div></section>}
    <footer><a className="brand" href="#top"><span className="brand-mark">p</span><span>pAIcture</span></a><p>Make AI conversations portable.</p><span>© 2026 pAIcture</span></footer>
  </main>;
}
