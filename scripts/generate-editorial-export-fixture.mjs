import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { exportDocumentCss } from "../lib/export-document-style.mjs";

const pdfDir = path.resolve("output/pdf");
const pngDir = path.resolve("output/png");
await Promise.all([mkdir(pdfDir, { recursive: true }), mkdir(pngDir, { recursive: true })]);

const imageSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d7dfeb"/><stop offset="1" stop-color="#c98572"/></linearGradient></defs><rect width="1200" height="760" fill="url(#g)"/><circle cx="820" cy="250" r="150" fill="#f7e9cc" opacity=".82"/><path d="M0 620 260 390l170 140 210-250 280 340z" fill="#343b4b" opacity=".86"/><text x="65" y="95" font-family="Arial" font-size="30" fill="#2d313b">GENERATED CONCEPT</text></svg>`;
const imageSrc = `data:image/svg+xml;base64,${Buffer.from(imageSvg).toString("base64")}`;
const longText = Array.from({ length: 13 }, (_, index) => `<p><strong>Point ${index + 1}.</strong> MVCC coordinates Undo Log and Read View so readers can observe a consistent version without blocking writers. 这是用于验证中文字体、自然换行、分页和内容完整性的技术说明。</p>`).join("");

function exchange(number, question, answer) {
  return `<section class="conversation-exchange"><header class="conversation-question-heading"><span class="conversation-exchange-number">${String(number).padStart(2, "0")}</span><span class="conversation-question-label">Question</span></header><article class="conversation-message user"><div class="conversation-role">You</div><div class="conversation-message-content">${question}</div></article><article class="conversation-message assistant"><div class="conversation-role">ChatGPT</div><div class="conversation-message-content">${answer}</div></article></section>`;
}

const exchanges = [
  exchange(1, "<p>Why does MVCC need undo logs, and how does a Read View decide which version is visible?</p>", `<h2>A practical mental model</h2><p>MVCC separates <strong>logical visibility</strong> from the latest physical row. Undo records form a version chain; the Read View defines which transaction IDs are visible.</p><blockquote><p>A consistent read asks “which committed version belongs to my snapshot?” rather than “what is the newest row?”</p></blockquote><ul><li>Undo Log preserves earlier versions.</li><li>Read View applies visibility rules.</li><li>Consistent reads avoid unnecessary blocking.</li></ul>${longText}`),
  exchange(2, "<p>Can you show a compact implementation and compare the lock types in a table?</p>", `<h2>Implementation sketch</h2><p>Inline values such as <code>lowLimitId</code> remain visually distinct without interrupting the paragraph.</p><pre><code class="language-cpp">bool isVisible(TransactionId trxId, const ReadView&amp; view) {\n  if (trxId &lt; view.upLimitId) return true;\n  if (trxId &gt;= view.lowLimitId) return false;\n  return !view.active.contains(trxId);\n}</code></pre><h3>Lock comparison</h3><table><thead><tr><th>Lock</th><th>Protects</th><th>Typical purpose</th></tr></thead><tbody><tr><td>Record</td><td>One index entry</td><td>Protect an existing row</td></tr><tr><td>Gap</td><td>Space between keys</td><td>Prevent phantom inserts</td></tr><tr><td>Next-key</td><td>Record and preceding gap</td><td>Range updates under repeatable read</td></tr></tbody></table>`),
  exchange(3, "<p>Create a restrained visual concept that can sit inside a professional document.</p>", `<p>Here is a generated concept with text before and after the artwork.</p><figure class="conversation-image"><img src="${imageSrc}" width="1200" height="760" alt="Abstract mountain concept"></figure><p>The image retains its aspect ratio and remains visually connected to this answer through a quiet caption and consistent spacing.</p>`),
].join("");

const appearance = process.env.DOCUMENT_APPEARANCE === "dark" ? "dark" : "light";
const paper = ["A4", "A3", "Letter"].includes(process.env.PAPER_SIZE) ? process.env.PAPER_SIZE : "A4";
const landscape = process.env.ORIENTATION === "landscape";
const suffix = `${paper.toLowerCase()}-${landscape ? "landscape" : "portrait"}-${appearance}`;
const margin = paper === "A3" ? "21.7mm" : "18mm";
const pageDimensions = { A4: [794, 1123], A3: [1123, 1587], Letter: [816, 1056] }[paper];
const [pageWidth, pageHeight] = landscape ? [pageDimensions[1], pageDimensions[0]] : pageDimensions;
const documentHtml = `<div class="conversation-document" data-appearance="${appearance}"><header class="conversation-document-head"><div class="conversation-document-brand"><span>pAIcture</span><i></i></div><p class="conversation-document-kicker">AI conversation document</p><h3>Understanding MVCC, Locks, and Read Views</h3><div class="conversation-document-meta"><span><small>Exported</small>September 27, 2026</span><span><small>Source</small>ChatGPT</span><span><small>Selected</small>3 exchanges</span></div></header><div class="conversation-messages">${exchanges}</div></div>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${exportDocumentCss}\n@page { size: ${paper} ${landscape ? "landscape" : "portrait"}; margin: ${margin}; }</style></head><body>${documentHtml}</body></html>`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: pageWidth, height: pageHeight }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((image) => image.decode?.().catch(() => undefined))); await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ format: paper, landscape, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: `<div style="box-sizing:border-box;width:100%;padding:0 ${margin};color:#8a8a85;font:9px Arial,sans-serif;display:flex;justify-content:space-between"><span>pAIcture</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`, margin: { top: margin, right: margin, bottom: margin, left: margin }, tagged: true, outline: true });
  await writeFile(path.join(pdfDir, `paicture-export-studio-${suffix}.pdf`), pdf);
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize({ width: pageWidth, height: Math.ceil(await page.locator(".conversation-document").evaluate((element) => element.scrollHeight)) });
  await page.locator(".conversation-document").screenshot({ path: path.join(pngDir, `paicture-export-studio-${suffix}.png`), type: "png" });
  console.log(path.join(pdfDir, `paicture-export-studio-${suffix}.pdf`));
  console.log(path.join(pngDir, `paicture-export-studio-${suffix}.png`));
} finally {
  await browser.close();
}
