"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Download, FileImage, FileText, Link2, LoaderCircle, Moon, ShieldCheck, Sparkles, Sun } from "lucide-react";

type Platform = "chatgpt" | "gemini" | "claude";
type Message = { id: string; role: "user" | "assistant"; html: string };
type Conversation = { title: string; platform: Platform; messages: Message[]; warnings?: string[] };
type ExtractResponse = Conversation & { error?: string; browserFallback?: boolean };
const platforms: Record<Platform, { name: string; mark: string }> = { chatgpt: { name: "ChatGPT", mark: "◎" }, gemini: { name: "Gemini", mark: "✦" }, claude: { name: "Claude", mark: "C" } };

function detectPlatform(value: string): Platform | null {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if ((host === "chatgpt.com" || host === "chat.openai.com") && (/^\/share\/[a-z0-9-]+\/?$/i.test(new URL(value).pathname) || /\/(?:g\/[^/]+\/)?c\/[a-z0-9-]+\/?$/i.test(new URL(value).pathname))) return "chatgpt";
  } catch {}
  return null;
}

function companionRequest(type: "ping" | "extract", url?: string, timeout = 1000) {
  return new Promise<Conversation | true>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", listener);
      reject(new Error(type === "ping" ? "The pAIcture Companion is not installed or enabled." : "The browser companion did not finish extracting the conversation."));
    }, timeout);
    const listener = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "paicture-companion" || event.data?.requestId !== requestId) return;
      if (type === "ping" && event.data.type === "ready") {
        clearTimeout(timer); window.removeEventListener("message", listener); resolve(true); return;
      }
      if (type === "extract" && event.data.type === "result") {
        clearTimeout(timer); window.removeEventListener("message", listener);
        if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.conversation as Conversation);
      }
    };
    window.addEventListener("message", listener);
    window.postMessage({ source: "paicture-web", type, requestId, url }, location.origin);
  });
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
  const previewRef = useRef<HTMLDivElement>(null);
  const detected = useMemo(() => detectPlatform(url.trim()), [url]);

  useEffect(() => {
    const saved = localStorage.getItem("paicture-theme");
    setTheme(saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light");
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("paicture-theme", theme); }, [theme]);

  async function processConversation(event: React.FormEvent) {
    event.preventDefault();
    if (!detected) { setError("Paste a ChatGPT conversation URL, such as chatgpt.com/c/… or chatgpt.com/share/…"); setStatus("error"); return; }
    setStatus("loading"); setError(""); setConversation(null); setProgress(18);
    const timer = window.setInterval(() => setProgress((value) => Math.min(value + 9, 86)), 420);
    try {
      const isPrivateConversation = /\/(?:g\/[^/]+\/)?c\//i.test(new URL(url.trim()).pathname);
      if (isPrivateConversation) {
        try {
          await companionRequest("ping", undefined, 1200);
          const imported = await companionRequest("extract", url.trim(), 60000) as Conversation;
          setConversation(imported); setProgress(100); setStatus("ready");
          requestAnimationFrame(() => document.querySelector("#preview")?.scrollIntoView({ behavior: "smooth", block: "start" }));
          return;
        } catch (fallbackError) {
          throw new Error(`${fallbackError instanceof Error ? fallbackError.message : "Authenticated browser import failed."} Install or enable pAIcture Companion, sign in to ChatGPT in the same browser, then try again.`);
        }
      }
      const response = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim() }) });
      const responseText = await response.text();
      let data: ExtractResponse;
      try { data = JSON.parse(responseText) as ExtractResponse; }
      catch {
        if (response.status === 401 || /sign in required/i.test(responseText)) throw new Error("Your pAIcture session is not signed in. Sign in to the site, then try the link again.");
        throw new Error(`pAIcture received ${response.headers.get("content-type") || "a non-JSON response"} (HTTP ${response.status}) instead of extraction data.`);
      }
      if (!response.ok) {
        if (detected === "chatgpt" && data.browserFallback) {
          try {
            await companionRequest("ping", undefined, 900);
            data = await companionRequest("extract", url.trim(), 60000) as Conversation;
          } catch (fallbackError) {
            throw new Error(`${data.error || "Direct extraction was blocked."} ${fallbackError instanceof Error ? fallbackError.message : ""} Download the companion below to enable browser-assisted structured extraction.`);
          }
        } else throw new Error(data.error || "We could not read this conversation.");
      }
      setConversation(data); setProgress(100); setStatus("ready");
      requestAnimationFrame(() => document.querySelector("#preview")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "We could not read this conversation."); setStatus("error"); setProgress(0); }
    finally { clearInterval(timer); }
  }

  async function exportDocument() {
    if (!conversation || !previewRef.current) return;
    setExporting(true);
    const { default: html2canvas } = await import("html2canvas");
    try {
      const slug = conversation.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "conversation";
      const source = previewRef.current;
      const pageAspect = 841.89 / 595.28;
      const pageHeight = Math.max(900, Math.floor(source.clientWidth * pageAspect));
      const totalHeight = source.scrollHeight;
      const captureScale = Math.min(2, 30000 / Math.max(totalHeight, 1));
      const fullCanvas = await html2canvas(source, { scale: captureScale, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: source.scrollWidth, windowHeight: totalHeight });
      const pages = [] as HTMLCanvasElement[];
      for (let offset = 0; offset < totalHeight; offset += pageHeight) {
        const sliceHeight = Math.min(pageHeight, totalHeight - offset);
        const canvas = document.createElement("canvas");
        canvas.width = fullCanvas.width;
        canvas.height = Math.ceil(sliceHeight * captureScale);
        canvas.getContext("2d")?.drawImage(fullCanvas, 0, Math.floor(offset * captureScale), fullCanvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        pages.push(canvas);
      }
      if (format === "pdf") {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
        const pdfWidth = pdf.internal.pageSize.getWidth(), pdfHeight = pdf.internal.pageSize.getHeight();
        pages.forEach((canvas, index) => {
          if (index) pdf.addPage();
          const height = Math.min(pdfHeight, canvas.height * pdfWidth / canvas.width);
          pdf.addImage(canvas.toDataURL("image/jpeg", .94), "JPEG", 0, 0, pdfWidth, height, undefined, "FAST");
        });
        pdf.save(`${slug}.pdf`);
      } else {
        for (let page = 0; page < pages.length; page++) {
          const link = document.createElement("a"); link.download = `${slug}-${page + 1}.png`; link.href = pages[page].toDataURL("image/png", 1); link.click();
          await new Promise((resolve) => setTimeout(resolve, 180));
        }
      }
    } finally { setExporting(false); }
  }

  return <main>
    <header className="site-header"><a className="brand" href="#top" aria-label="pAIcture home"><span className="brand-mark">p</span><span>pAIcture</span></a><div className="header-meta"><span className="status-dot" /> Early access</div><button className="theme-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}><Sun size={16} /><span className="toggle-track"><span className="toggle-thumb" /></span><Moon size={16} /></button></header>
    <section id="top" className="hero"><div className="eyebrow"><Sparkles size={14} /> AI conversations, beautifully kept</div><h1>From shared chat<br />to <em>finished document.</em></h1><p className="hero-copy">Turn public AI conversations into polished PDFs or high-resolution images—without losing the structure that makes them useful.</p>
      <form className="link-card" onSubmit={processConversation}><label htmlFor="conversation-url">Paste a ChatGPT conversation URL</label><div className={`url-field ${status === "error" ? "invalid" : ""}`}><Link2 size={20} /><input id="conversation-url" value={url} onChange={(event) => { setUrl(event.target.value); if (status === "error") setStatus("idle"); }} placeholder="https://chatgpt.com/c/… or /share/…" autoComplete="url" />{detected && <span className="detected"><span>{platforms[detected].mark}</span>{platforms[detected].name}</span>}<button type="submit" disabled={status === "loading"}>{status === "loading" ? <LoaderCircle className="spin" size={20} /> : <ArrowRight size={20} />}</button></div><p className="paste-help">Private conversations are read inside your signed-in browser by pAIcture Companion. Your ChatGPT cookies are never sent to pAIcture.</p>
        {status === "loading" && <div className="progress-wrap"><div className="progress-line"><span style={{ width: `${progress}%` }} /></div><p>Reading the conversation and preserving its structure… <strong>{progress}%</strong></p></div>}
        {status === "error" && <div className="error-note"><strong>We couldn’t complete this import.</strong><span>{error}</span>{detected === "chatgpt" && error.toLowerCase().includes("companion") ? <a href="/paicture-companion.zip" download>Download pAIcture Companion</a> : null}</div>}
        <div className="supported"><span>Current focus</span><div><i>{platforms.chatgpt.mark}</i>ChatGPT</div><div>Public and signed-in conversations</div></div></form>
      <div className="trust-row"><span><ShieldCheck size={17} />Processed only when you ask</span><span><Check size={17} />Formatting preserved</span><span><Check size={17} />No public gallery</span></div></section>
    {conversation ? <section id="preview" className="workspace"><div className="workspace-heading"><div><span className="section-index">01 / Preview</span><h2>Review before export</h2><p>Check every message, image, table, and code block before creating the final file.</p></div><div className="platform-pill"><span>{platforms[conversation.platform].mark}</span>{platforms[conversation.platform].name}</div></div>
      {conversation.warnings?.length ? <div className="warning"><strong>Import note</strong>{conversation.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : null}<div className="preview-shell"><div className="document" ref={previewRef}><div className="document-head"><span>{platforms[conversation.platform].name} conversation</span><h3>{conversation.title}</h3><p>Prepared with pAIcture</p></div><div className="messages">{conversation.messages.map((message) => <article className={`message ${message.role}`} key={message.id}><div className="role">{message.role === "user" ? "You" : platforms[conversation.platform].name}</div><div className="message-content" dangerouslySetInnerHTML={{ __html: message.html }} /></article>)}</div></div>
      <aside className="export-panel"><span className="section-index">02 / Export</span><h3>Choose your format</h3><button className={format === "pdf" ? "selected" : ""} onClick={() => setFormat("pdf")}><FileText size={22} /><span><strong>PDF document</strong><small>High-resolution, paginated document</small></span>{format === "pdf" && <Check size={17} />}</button><button className={format === "images" ? "selected" : ""} onClick={() => setFormat("images")}><FileImage size={22} /><span><strong>PNG images</strong><small>High-resolution, split when needed</small></span>{format === "images" && <Check size={17} />}</button><div className="quality"><span>Quality</span><button>High <ChevronDown size={14} /></button></div><button className="export-button" onClick={exportDocument} disabled={exporting}>{exporting ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />}{exporting ? "Preparing file…" : `Export ${format === "pdf" ? "PDF" : "images"}`}</button><p className="privacy-note"><ShieldCheck size={15} />Your imported content is not saved to a public library.</p></aside></div></section>
      : <section className="process"><span className="section-index">How it works</span><div className="process-grid"><article><b>01</b><h2>Open</h2><p>Sign in to ChatGPT in your browser and copy the conversation URL.</p></article><article><b>02</b><h2>Import</h2><p>The companion reads only that conversation and preserves its rendered structure.</p></article><article><b>03</b><h2>Export</h2><p>Review every turn, then download a PDF or high-resolution PNG pages.</p></article></div></section>}
    <footer><a className="brand" href="#top"><span className="brand-mark">p</span><span>pAIcture</span></a><p>Make AI conversations portable.</p><span>© 2026 pAIcture</span></footer>
  </main>;
}
