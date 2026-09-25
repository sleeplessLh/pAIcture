import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { exportDocumentCss } from "../lib/export-document-style.mjs";

const outputDir = path.resolve("output/pdf");
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "paicture-vector-pagination-stress-test.pdf");
const longChinese = "这是用于测试中文字体、换行、粗体和分页效果的一段文字。MVCC、Undo Log、Read View、Gap Lock、Next-Key Lock 都应该清晰显示。";
const paragraphs = Array.from({ length: 34 }, (_, index) => `<p><strong>段落 ${index + 1}。</strong>${longChinese} This paragraph verifies Latin typography, line wrapping, and PDF vector rendering. <em>Italic content remains in document flow.</em></p>`).join("");
const code = Array.from({ length: 70 }, (_, index) => `const row${index + 1} = await database.read({ lock: "next-key", index: ${index + 1} });`).join("\n");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${exportDocumentCss}</style></head><body>
<div class="conversation-document">
  <header class="conversation-document-head"><h3>pAIcture Rendering Stress Test</h3><p>ChatGPT conversation <span>·</span> September 25, 2026</p></header>
  <div class="conversation-messages">
    <article class="conversation-message user"><div class="conversation-role">You</div><div class="conversation-message-content"><h2>中英文渲染测试</h2><p>${longChinese}</p><blockquote><p>引用内容不得覆盖正文或页脚。</p></blockquote><ol><li>Numbered item</li><li>第二项</li></ol></div></article>
    <article class="conversation-message assistant"><div class="conversation-role">ChatGPT</div><div class="conversation-message-content"><h2>Long response crossing pages</h2>${paragraphs}<h3>Code block near a page boundary</h3><pre><code>${code}</code></pre><h3>Table and image flow</h3><table><thead><tr><th>Feature</th><th>Expected result</th></tr></thead><tbody><tr><td>Vector text</td><td>Selectable and searchable</td></tr><tr><td>CJK</td><td>清晰、无重叠、无截断</td></tr></tbody></table><svg role="img" aria-label="Flow test image" viewBox="0 0 600 180" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%;height:auto;margin:14px 0"><rect width="600" height="180" rx="16" fill="#eef6f5"/><text x="300" y="95" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#0f766e">Image remains in normal flow</text></svg><p>Final integrity marker: PAICTURE_EXPORT_COMPLETE</p></div></article>
  </div>
</div></body></html>`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => { await document.fonts.ready; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: '<div style="box-sizing:border-box;width:100%;padding:0 18mm;color:#8a8a85;font:9px Arial,sans-serif;display:flex;justify-content:space-between"><span>pAIcture</span><span class="pageNumber"></span></div>', margin: { top: "17mm", right: "18mm", bottom: "19mm", left: "18mm" }, tagged: true, outline: true });
  await writeFile(outputPath, pdf);
  console.log(outputPath);
} finally {
  await browser.close();
}
