import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: "https://paicture.vercel.app", lastModified, changeFrequency: "weekly", priority: 1 },
    { url: "https://paicture.vercel.app/privacy", lastModified, changeFrequency: "monthly", priority: 0.4 },
    { url: "https://paicture.vercel.app/terms", lastModified, changeFrequency: "monthly", priority: 0.4 },
    { url: "https://paicture.vercel.app/support", lastModified, changeFrequency: "monthly", priority: 0.4 },
  ];
}
