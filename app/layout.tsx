import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-sc/index.css";
import "./globals.css";
const title = "pAIcture — ChatGPT conversations, beautifully kept";
const description = "Turn public ChatGPT shared conversations into polished PDF documents or high-resolution images.";

export const metadata: Metadata = {
  metadataBase: new URL("https://paicture.vercel.app"),
  title,
  description,
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "pAIcture",
    title,
    description,
    images: [{ url: "/project-gallery/01-paicture-cover.png", width: 1680, height: 941, alt: "pAIcture turns AI conversations into polished documents" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/project-gallery/01-paicture-cover.png"],
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" suppressHydrationWarning><body>{children}</body></html>; }
