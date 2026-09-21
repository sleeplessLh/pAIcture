"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Download, FileImage, FileText, Link2, LoaderCircle, Moon, ShieldCheck, Sparkles, Sun } from "lucide-react";
import { marked } from "marked";
import { sanitizeHtml } from "@/lib/conversation/sanitize";

type Platform = "chatgpt" | "gemini" | "claude";
type Message = { id: string; role: "user" | "assistant"; html: string };
type Conversation = { title: string; platform: Platform; messages: Message[]; warnings?: string[] };
type ExtractResponse = Conversation & { error?: string; browserFallback?: boolean };
const platforms: Record<Platform, { name: string; mark: string }> = { chatgpt: { name: "ChatGPT", mark: "◎" }, gemini: { name: "Gemini", mark: "✦" }, claude: { name: "Claude", mark: "C" } };

function detectPlatform(value: string): Platform | null {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    if (host === "chatgpt.com" || host === "chat.openai.com") return "chatgpt";
    if (host === "gemini.google.com" || host === "g.co") return "gemini";
    if (host === "claude.ai") return "claude";
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
  const [importMode, setImportMode] = useState<"link" | "text">("link");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [pastedPlatform, setPastedPlatform] = useState<Platform>("chatgpt");
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
    if (importMode === "text") {
      const source = pastedText.trim();
      if (!source) { setError("Paste a conversation transcript to continue."); setStatus("error"); return; }
      const marker = /^(?:#{0,3}\s*)?(you|user|human|chatgpt|assistant|claude|gemini)\s*(?:said)?\s*:\s*/i;
      const chunks: Array<{ role: "user" | "assistant"; content: string }> = [];
      let current: { role: "user" | "assistant"; content: string } | null = null;
      for (const line of source.split(/\r?\n/)) {
        const match = line.match(marker);
        if (match) {
          if (current?.content.trim()) chunks.push(current);
          current = { role: /^(you|user|human)$/i.test(match[1]) ? "user" : "assistant", content: line.slice(match[0].length) };
        } else if (current) current.content += `${current.content ? "\n" : ""}${line}`;
        else current = { role: "user", content: line };
      }
      if (current?.content.trim()) chunks.push(current);
      const messages = chunks.filter((item) => item.content.trim()).map((item, index) => ({ id: `pasted-${index + 1}`, role: item.role, html: sanitizeHtml(marked.parse(item.content.trim(), { async: false, gfm: true, breaks: true }) as string) }));
      if (!messages.length) { setError("No readable messages were found in the pasted transcript."); setStatus("error"); return; }
      setConversation({ title: "Pasted AI conversation", platform: pastedPlatform, messages, warnings: chunks.length === 1 ? ["No speaker labels were detected. Add labels such as “You:” and “Assistant:” on separate lines for accurate role separation."] : undefined });
      setError(""); setProgress(100); setStatus("ready");
      requestAnimationFrame(() => document.querySelector("#preview")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    if (!detected) { setError("Paste a public ChatGPT, Gemini, or Claude share link."); setStatus("error"); return; }
    setStatus("loading"); setError(""); setConversation(null); setProgress(18);
    const timer = window.setInterval(() => setProgress((value) => Math.min(value + 9, 86)), 420);
    try {
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
            data = await companionRequest("extract", url.trim(), 35000) as Conversation;
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
      const pages = [] as HTMLCanvasElement[];
      for (let offset = 0; offset < totalHeight; offset += pageHeight) {
        const canvas = await html2canvas(source, {
          scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
          y: offset, height: Math.min(pageHeight, totalHeight - offset),
          windowWidth: source.scrollWidth, windowHeight: totalHeight,
        });
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
      <form className="link-card" onSubmit={processConversation}><div className="import-tabs" role="tablist" aria-label="Import method"><button type="button" role="tab" aria-selected={importMode === "link"} className={importMode === "link" ? "active" : ""} onClick={() => { setImportMode("link"); setStatus("idle"); setError(""); }}>Public link</button><button type="button" role="tab" aria-selected={importMode === "text"} className={importMode === "text" ? "active" : ""} onClick={() => { setImportMode("text"); setStatus("idle"); setError(""); }}>Paste transcript</button></div>{importMode === "link" ? <><label htmlFor="conversation-url">Paste a public conversation link</label><div className={`url-field ${status === "error" ? "invalid" : ""}`}><Link2 size={20} /><input id="conversation-url" value={url} onChange={(event) => { setUrl(event.target.value); if (status === "error") setStatus("idle"); }} placeholder="https://chatgpt.com/share/…" autoComplete="url" />{detected && <span className="detected"><span>{platforms[detected].mark}</span>{platforms[detected].name}</span>}<button type="submit" disabled={status === "loading"}>{status === "loading" ? <LoaderCircle className="spin" size={20} /> : <ArrowRight size={20} />}</button></div></> : <><div className="paste-heading"><label htmlFor="conversation-text">Paste a labelled conversation</label><select value={pastedPlatform} onChange={(event) => setPastedPlatform(event.target.value as Platform)} aria-label="Conversation platform">{(Object.keys(platforms) as Platform[]).map((key) => <option value={key} key={key}>{platforms[key].name}</option>)}</select></div><textarea id="conversation-text" value={pastedText} onChange={(event) => { setPastedText(event.target.value); if (status === "error") setStatus("idle"); }} placeholder={'You: Summarize this project.\n\nAssistant: ## Summary\n\nThe project exports **AI conversations** as documents.'} /><button className="paste-submit" type="submit"><ArrowRight size={18} /> Create preview</button><p className="paste-help">Use labels such as <strong>You:</strong> and <strong>Assistant:</strong>. Markdown, code blocks, lists, links, and tables are preserved.</p></>}
        {status === "loading" && <div className="progress-wrap"><div className="progress-line"><span style={{ width: `${progress}%` }} /></div><p>Reading the conversation and preserving its structure… <strong>{progress}%</strong></p></div>}
        {status === "error" && <div className="error-note"><strong>We couldn’t complete this import.</strong><span>{error}</span>{detected === "chatgpt" && error.includes("companion") ? <a href="/paicture-companion.zip" download>Download pAIcture Companion</a> : null}</div>}
        <div className="supported"><span>{importMode === "link" ? "Recognized links" : "Preview platform"}</span>{(Object.keys(platforms) as Platform[]).map((key) => <div key={key}><i>{platforms[key].mark}</i>{platforms[key].name}</div>)}</div></form>
      <div className="trust-row"><span><ShieldCheck size={17} />Processed only when you ask</span><span><Check size={17} />Formatting preserved</span><span><Check size={17} />No public gallery</span></div></section>
    {conversation ? <section id="preview" className="workspace"><div className="workspace-heading"><div><span className="section-index">01 / Preview</span><h2>Review before export</h2><p>Check every message, image, table, and code block before creating the final file.</p></div><div className="platform-pill"><span>{platforms[conversation.platform].mark}</span>{platforms[conversation.platform].name}</div></div>
      {conversation.warnings?.length ? <div className="warning"><strong>Import note</strong>{conversation.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : null}<div className="preview-shell"><div className="document" ref={previewRef}><div className="document-head"><span>{platforms[conversation.platform].name} conversation</span><h3>{conversation.title}</h3><p>Prepared with pAIcture</p></div><div className="messages">{conversation.messages.map((message) => <article className={`message ${message.role}`} key={message.id}><div className="role">{message.role === "user" ? "You" : platforms[conversation.platform].name}</div><div className="message-content" dangerouslySetInnerHTML={{ __html: message.html }} /></article>)}</div></div>
      <aside className="export-panel"><span className="section-index">02 / Export</span><h3>Choose your format</h3><button className={format === "pdf" ? "selected" : ""} onClick={() => setFormat("pdf")}><FileText size={22} /><span><strong>PDF document</strong><small>High-resolution, paginated document</small></span>{format === "pdf" && <Check size={17} />}</button><button className={format === "images" ? "selected" : ""} onClick={() => setFormat("images")}><FileImage size={22} /><span><strong>PNG images</strong><small>High-resolution, split when needed</small></span>{format === "images" && <Check size={17} />}</button><div className="quality"><span>Quality</span><button>High <ChevronDown size={14} /></button></div><button className="export-button" onClick={exportDocument} disabled={exporting}>{exporting ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />}{exporting ? "Preparing file…" : `Export ${format === "pdf" ? "PDF" : "images"}`}</button><p className="privacy-note"><ShieldCheck size={15} />Your imported content is not saved to a public library.</p></aside></div></section>
      : <section className="process"><span className="section-index">How it works</span><div className="process-grid"><article><b>01</b><h2>Share</h2><p>Paste a public link from a supported AI platform.</p></article><article><b>02</b><h2>Preserve</h2><p>We retain the order, formatting, code, tables, and media we can access.</p></article><article><b>03</b><h2>Export</h2><p>Review the result, then download it as a document or image set.</p></article></div></section>}
    <footer><a className="brand" href="#top"><span className="brand-mark">p</span><span>pAIcture</span></a><p>Make AI conversations portable.</p><span>© 2026 pAIcture</span></footer>
  </main>;
}
