import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { adapters } from "../lib/conversation/adapters";

const source = process.argv[2];
if (!source) throw new Error("Pass a public ChatGPT share URL.");
const adapter = adapters.find((candidate) => candidate.platform === "chatgpt");
if (!adapter) throw new Error("ChatGPT adapter is not registered.");
const conversation = await adapter.extract(new URL(source));
const body = conversation.messages.map((message) => `
  <article class="message ${message.role}">
    <div class="role">${message.role === "user" ? "You" : "ChatGPT"}</div>
    <div class="content">${message.html}</div>
  </article>`).join("");
const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>${conversation.title}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #171714; font: 15px/1.65 Inter, "Segoe UI", "Microsoft YaHei", sans-serif; }
  header { padding: 0 0 24px; border-bottom: 1px solid #ddd; }
  header small,.role { color: #777; font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  h1 { margin: 10px 0 0; font: 38px/1.1 Georgia, "Microsoft YaHei", serif; }
  .message { display: grid; grid-template-columns: 76px minmax(0,1fr); gap: 20px; padding: 26px 0; border-bottom: 1px solid #e4e4df; }
  .message.user { background: #faf9f5; margin-inline: -10px; padding-inline: 10px; }
  .content { min-width: 0; }
  .content > :first-child { margin-top: 0; }
  .content > :last-child { margin-bottom: 0; }
  h1,h2,h3,h4 { break-after: avoid; }
  p,li,blockquote { orphans: 3; widows: 3; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #171714; color: #f7f5ee; padding: 14px; border-radius: 7px; break-inside: auto; }
  code { font-family: Consolas, monospace; font-size: .88em; }
  :not(pre) > code { background: #efeee9; padding: .14em .32em; border-radius: 4px; }
  blockquote { margin-left: 0; border-left: 3px solid #ff5a36; padding-left: 16px; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th,td { border: 1px solid #ddd; padding: 7px; text-align: left; }
  img { max-width: 100%; height: auto; }
  a { color: #b33720; overflow-wrap: anywhere; }
</style></head><body><header><small>ChatGPT conversation · pAIcture verification</small><h1>${conversation.title}</h1></header><main>${body}</main></body></html>`;
const outputDir = resolve("tmp/pdfs");
await mkdir(outputDir, { recursive: true });
const output = resolve(outputDir, "chatgpt-verification.html");
await writeFile(output, html, "utf8");
console.log(JSON.stringify({ output, title: conversation.title, messageCount: conversation.messages.length }));
