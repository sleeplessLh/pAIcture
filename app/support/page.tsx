import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Support — pAIcture" };

export default function SupportPage() {
  return <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px 24px 96px", lineHeight: 1.7 }}>
    <p><Link href="/">← pAIcture</Link></p>
    <h1>pAIcture Support</h1>
    <p>For installation help, rendering problems, privacy requests, or bug reports, open an issue in the public pAIcture repository.</p>
    <p><a href="https://github.com/sleeplessLh/pAIcture/issues" target="_blank" rel="noreferrer">Open a support request on GitHub</a></p>
    <h2>Include in a bug report</h2>
    <ul>
      <li>Whether you used the ChatGPT plugin, website, Chrome extension, or Edge extension.</li>
      <li>Your browser and operating-system versions.</li>
      <li>The export format and a description of the missing or incorrect layout.</li>
    </ul>
    <p>Do not include private conversations, authentication tokens, passwords, or other sensitive information in a public issue.</p>
  </main>;
}
