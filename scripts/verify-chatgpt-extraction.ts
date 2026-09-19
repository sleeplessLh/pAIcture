import { adapters } from "../lib/conversation/adapters";

const source = process.argv[2];
if (!source) throw new Error("Pass a public ChatGPT share URL.");

const adapter = adapters.find((candidate) => candidate.platform === "chatgpt");
if (!adapter) throw new Error("ChatGPT adapter is not registered.");

const result = await adapter.extract(new URL(source));
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
