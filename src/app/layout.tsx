import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Malcom",
  description: "A dark local AI chat interface for Malcom.",
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
