import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { adapters, parseChatGptShareHtml } from "../lib/conversation/adapters";

const source = process.argv[2];
if (!source) throw new Error("Pass a public ChatGPT share URL.");

const result = existsSync(resolve(source))
  ? parseChatGptShareHtml(await readFile(resolve(source), "utf8"))
  : await adapters[0].extract(new URL(source));
const plain = result.messages.map((message) => ({
  role: message.role,
  text: message.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
}));

console.log(JSON.stringify({
  title: result.title,
  messageCount: result.messages.length,
  roles: result.messages.map((message) => message.role),
  first: plain[0]?.text.slice(0, 160),
  last: plain.at(-1)?.text.slice(0, 160),
  emptyMessages: plain.filter((message) => !message.text).length,
}, null, 2));
