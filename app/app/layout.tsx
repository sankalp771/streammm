import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "STREAM — Monad AI Sessions",
  description: "AI services that only cost you while they are working.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#0a0a0c] text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
