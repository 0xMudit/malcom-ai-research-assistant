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
    default: "Malcom — AI Research Command Center",
    template: "%s | Malcom",
  },
  description:
    "Malcom is an AI-powered research workspace for engineers, scientists, builders, and serious learners. Analyze documents, render math, review code, and synthesize technical ideas faster.",
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
    title: "Malcom — AI Research Command Center",
    description:
      "AI-powered research workspace for documents, math, code, and technical synthesis.",
    url: "/",
    siteName: "Malcom",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Malcom AI research command center",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Malcom — AI Research Command Center",
    description:
      "AI-powered research workspace for documents, math, code, and technical synthesis.",
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
