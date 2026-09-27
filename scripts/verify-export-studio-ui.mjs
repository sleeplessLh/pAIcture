import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.PAICTURE_TEST_URL || "http://127.0.0.1:5173";
const output = path.resolve("output/export-studio-ui");
await mkdir(output, { recursive: true });
const paragraphs = Array.from({ length: 18 }, (_, index) => `<p><strong>Section ${index + 1}.</strong> This long response verifies deterministic pagination, multilingual wrapping, and complete content. 这是用于验证中文换行、分页和清晰度的内容。</p>`).join("");
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
  await page.waitForFunction(() => document.querySelectorAll(".page-preview").length >= 2, undefined, { timeout: 30_000 });
  const initialPages = await page.locator(".page-preview").count();
  if (initialPages < 2) throw new Error(`Expected a multi-page preview, received ${initialPages} page(s).`);
  await page.getByRole("button", { name: "PNG" }).click();
  await page.getByRole("button", { name: "A3" }).click();
  await page.getByRole("button", { name: "Landscape" }).click();
  await page.getByRole("button", { name: "2 in 1" }).click();
  await page.locator(".composition-preview img").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.screenshot({ path: path.join(output, "export-studio-a3-landscape.png"), fullPage: true });
  const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: /Create PNG images/ }).click();
  const download = await downloadPromise;
  await download.saveAs(path.join(output, download.suggestedFilename()));
  console.log(JSON.stringify({ initialPages, composedImages: await page.locator(".composition-preview figure").count(), download: download.suggestedFilename() }));
} finally {
  await browser.close();
}
