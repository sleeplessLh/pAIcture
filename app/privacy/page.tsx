import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy — pAIcture" };

export default function PrivacyPage() {
  return <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px 24px 96px", lineHeight: 1.7 }}>
    <p><Link href="/">← pAIcture</Link></p>
    <h1>Privacy Policy</h1>
    <p>Last updated: September 30, 2026</p>
    <h2>What pAIcture processes</h2>
    <p>pAIcture processes the conversation content that you explicitly provide for preview and export. This may include message text, links, code, tables, mathematical expressions, and images contained in that conversation.</p>
    <h2>How the information is used</h2>
    <p>The content is used only to build the requested preview and PDF or PNG export. pAIcture does not use conversation content for advertising, user profiling, or model training.</p>
    <h2>Storage and retention</h2>
    <p>Conversation content is processed for the current request and is not intentionally stored in a public conversation database. Temporary in-memory and browser-session data is discarded when the request or session ends. Hosting providers may retain limited operational and security logs according to their own retention policies; pAIcture does not intentionally place raw conversation content in application logs.</p>
    <h2>Sharing</h2>
    <p>Information is handled by the infrastructure providers needed to operate pAIcture and produce the requested file. It is not sold. pAIcture does not request ChatGPT passwords, authentication tokens, private history, payment-card data, or government identifiers.</p>
    <h2>Your choices</h2>
    <p>You decide whether to invoke the plugin or extension and which public conversation to export. You can close the preview without exporting. For privacy questions or deletion requests concerning operational records, use the <a href="/support">support page</a>.</p>
  </main>;
}
