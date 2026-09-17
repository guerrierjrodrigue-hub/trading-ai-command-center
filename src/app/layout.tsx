import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trading AI Command Center",
  description:
    "Personal AI trading co-pilot & paper-trading command center — simulation only.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-bg font-sans antialiased">{children}</body>
    </html>
  );
}
