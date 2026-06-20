import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

const siteUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000",
);

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "Malcom — All-Round AI Workspace",
    template: "%s | Malcom",
  },
  description:
    "Malcom is an all-round AI workspace for asking, writing, coding, planning, learning, analyzing documents, rendering math, and turning messy ideas into clear next steps.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "Malcom — All-Round AI Workspace",
    description:
      "AI workspace for questions, documents, math, code, planning, learning, and practical synthesis.",
    url: "/",
    siteName: "Malcom",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Malcom all-round AI workspace",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Malcom — All-Round AI Workspace",
    description:
      "AI workspace for questions, documents, math, code, planning, learning, and practical synthesis.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
