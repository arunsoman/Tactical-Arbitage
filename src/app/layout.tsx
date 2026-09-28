import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tactical Arbitrage — OA Sourcing Platform",
  description:
    "Scan 1,200+ retailers, match to Amazon, compute true net profit after every fee, and surface deals that meet your profitability filters. Scan → Match → Calculate → Filter → Act.",
  keywords: ["online arbitrage", "Amazon FBA", "sourcing", "deal finder", "profit calculator"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Tactical Arbitrage",
    description: "Find profitable online-arbitrage leads in minutes, not hours.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
