import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PAICTURE_TEST_URL || "http://127.0.0.1:5173";
const output = path.resolve("output/export-studio-ui");
await mkdir(output, { recursive: true });
const paragraphs = Array.from({ length: 120 }, (_, index) => `<p><strong>Section ${index + 1}.</strong> This long response verifies deterministic pagination, multilingual wrapping, and complete content. 这是用于验证中文换行、分页和清晰度的内容。</p>`).join("");
const conversation = {
  title: "Export Studio Pagination Validation",
  platform: "chatgpt",
  messages: [
    { id: "u1", role: "user", html: "<p>Explain how the new export layout handles a long answer.</p>" },
    { id: "a1", role: "assistant", html: `<h2>Layout model</h2><p>The selected configuration determines the page geometry.</p>${paragraphs}<pre><code>const page = layout(conversation, config);</code></pre>` },
    { id: "u2", role: "user", html: "<p>Show a compact comparison table.</p>" },
    { id: "a2", role: "assistant", html: "<table><thead><tr><th>Format</th><th>Strength</th></tr></thead><tbody><tr><td>PDF</td><td>Selectable vector text</td></tr><tr><td>PNG</td><td>High-resolution sharing</td></tr></tbody></table>" },
  ],
};

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  await page.route("**/api/import/chatgpt", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(conversation) }));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator("#conversation-url").fill("https://chatgpt.com/share/00000000-0000-0000-0000-000000000000");
  await page.getByRole("button", { name: "Create my document" }).click();
  await page.getByRole("button", { name: "Select all" }).click();
  await page.locator(".page-preview img").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll(".page-preview").length >= 8, undefined, { timeout: 60_000 });
  const logicalPageCount = await page.locator(".page-preview").count();
  const portraitFirstPage = await page.locator(".page-preview img").first().getAttribute("src");
  await page.getByRole("button", { name: "Landscape" }).click();
  await page.waitForFunction((previousSrc) => !document.querySelector(".preview-rendering") && document.querySelectorAll(".page-preview").length > 0 && document.querySelector(".page-preview img")?.getAttribute("src") !== previousSrc, portraitFirstPage, { timeout: 60_000 });
  const landscapeLogicalPageCount = await page.locator(".page-preview").count();
  const landscapeFirstPage = await page.locator(".page-preview img").first().getAttribute("src");
  await page.getByRole("button", { name: "4 in 1" }).click();
  await page.waitForFunction(({ logicalCount, previousSrc }) => !document.querySelector(".preview-rendering") && document.querySelectorAll(".page-preview").length === Math.ceil(logicalCount / 4) && document.querySelector(".page-preview img")?.getAttribute("src") !== previousSrc, { logicalCount: landscapeLogicalPageCount, previousSrc: landscapeFirstPage }, { timeout: 60_000 });
  const pdfOutputPages = await page.locator(".page-preview").count();
  const pdfDownloadPromise = page.waitForEvent("download", { timeout: 90_000 });
  await page.getByRole("button", { name: /Create PDF/ }).click();
  const pdfDownload = await pdfDownloadPromise;
  await pdfDownload.saveAs(path.join(output, pdfDownload.suggestedFilename()));
  await page.getByRole("button", { name: "PNG" }).click();
  await page.waitForFunction((expected) => document.querySelectorAll(".page-preview").length === expected, pdfOutputPages, { timeout: 30_000 });
  const pngOutputPages = await page.locator(".page-preview").count();
  if (pngOutputPages !== pdfOutputPages) throw new Error(`PDF/PNG preview mismatch: ${pdfOutputPages} vs ${pngOutputPages}.`);
  await page.screenshot({ path: path.join(output, "export-studio-a4-landscape-4-in-1.png"), fullPage: true });
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: /Create PNG images/ }).click();
  const download = await downloadPromise;
  await download.saveAs(path.join(output, download.suggestedFilename()));
  const beforeRealtimeUpdate = await page.locator(".page-preview img").first().getAttribute("src");
  await page.getByRole("button", { name: "A3", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "2 in 1" }).click();
  await page.waitForFunction((previousSrc) => !document.querySelector(".preview-rendering") && document.querySelectorAll(".page-preview").length > 0 && document.querySelector(".page-preview img")?.getAttribute("src") !== previousSrc, beforeRealtimeUpdate, { timeout: 60_000 });
  const realtimePreviewPages = await page.locator(".page-preview").count();
  console.log(JSON.stringify({ logicalPageCount, landscapeLogicalPageCount, pdfOutputPages, pngOutputPages, realtimePreviewPages, realtimeConfig: "A3 landscape dark 2-in-1", pdf: pdfDownload.suggestedFilename(), png: download.suggestedFilename() }));
} finally {
  await browser.close();
}
