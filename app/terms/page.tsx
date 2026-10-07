import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Service — pAIcture" };

export default function TermsPage() {
  return <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px 24px 96px", lineHeight: 1.7 }}>
    <p><Link href="/">← pAIcture</Link></p>
    <h1>Terms of Service</h1>
    <p>Last updated: September 30, 2026</p>
    <h2>Service</h2>
    <p>pAIcture converts conversation content supplied by a user into document previews, PDF files, and PNG images. The service is provided on an “as available” basis and may change as supported platforms evolve.</p>
    <h2>Your responsibilities</h2>
    <p>You must have the right to process and export the content you provide. Do not use pAIcture to infringe intellectual-property, privacy, confidentiality, or other legal rights, or to process credentials and restricted sensitive information.</p>
    <h2>Exports</h2>
    <p>You are responsible for reviewing generated files before sharing or relying on them. Layout and content fidelity may vary for unsupported or newly introduced page elements.</p>
    <h2>Availability and liability</h2>
    <p>pAIcture is provided without guarantees of uninterrupted availability or perfect rendering. To the extent permitted by law, the project maintainers are not liable for indirect or consequential losses arising from use of the service.</p>
    <h2>Contact</h2>
    <p>Questions about these terms can be submitted through the <a href="/support">support page</a>.</p>
  </main>;
}
