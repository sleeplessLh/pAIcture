import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const sourceDir = path.join(root, "output", "png");
const outputDir = path.join(root, "public", "project-gallery-english");
await mkdir(outputDir, { recursive: true });

const shots = [
  ["01-english-document-header.png", "paicture-export-studio-a4-portrait-light.png", 0],
  ["02-english-editorial-answer.png", "paicture-export-studio-a4-portrait-light.png", 680],
  ["03-english-code-and-table.png", "paicture-export-studio-a4-portrait-light.png", 1960],
  ["04-english-generated-image.png", "paicture-export-studio-a4-portrait-light.png", 2680],
  ["05-english-dark-document.png", "paicture-export-studio-a4-portrait-dark.png", 0],
  ["06-english-dark-technical.png", "paicture-export-studio-a4-portrait-dark.png", 1960],
  ["07-english-landscape-layout.png", "paicture-export-studio-a4-landscape-light.png", 0],
  ["08-english-a3-layout.png", "paicture-export-studio-a3-portrait-light.png", 0],
];

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 2 });
  for (const [name, source, scrollY] of shots) {
    const sourceUrl = `data:image/png;base64,${(await readFile(path.join(sourceDir, source))).toString("base64")}`;
    await page.setContent(`<!doctype html><html><head><style>
      *{box-sizing:border-box}html,body{margin:0;background:#edeae4;overflow:hidden}
      main{width:1100px;height:720px;display:grid;place-items:start center;padding:34px 58px}
      .frame{width:984px;height:652px;overflow:hidden;background:white;border:1px solid rgba(58,48,40,.12);box-shadow:0 24px 65px rgba(58,48,40,.17)}
      img{display:block;width:794px;height:auto;margin:0 auto;transform:translateY(-${scrollY}px)}
    </style></head><body><main><div class="frame"><img src="${sourceUrl}" alt="English pAIcture export example"></div></main></body></html>`, { waitUntil: "load" });
    await page.locator("img").evaluate(async (image) => { if (!image.complete) await new Promise((resolve) => image.addEventListener("load", resolve, { once: true })); await image.decode?.(); });
    await page.screenshot({ path: path.join(outputDir, name), type: "png" });
  }
} finally {
  await browser.close();
}

console.log(`Generated ${shots.length} English gallery images in ${outputDir}`);
