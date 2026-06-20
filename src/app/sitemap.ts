import type { MetadataRoute } from "next";

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://malcomman.duckdns.org";

const routes = [
  "",
  "/billing",
  "/changelog",
  "/contact",
  "/login",
  "/privacy",
  "/register",
  "/status",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = appUrl.replace(/\/$/, "");

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.6,
  }));
}
