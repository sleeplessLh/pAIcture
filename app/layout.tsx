import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "pAIcture — AI conversations, beautifully kept", description: "Turn shared ChatGPT, Gemini, and Claude conversations into polished PDF documents or high-resolution images.", icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" suppressHydrationWarning><body>{children}</body></html>; }
