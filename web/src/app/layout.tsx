import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { AuthSessionShell } from "@/components/AuthSessionShell";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Web Friendly CRM",
  description: "Sales pipeline for high-volume cold calling teams",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body
        className={`${inter.variable} ${geistMono.variable} relative min-h-svh max-w-[100%] overflow-x-hidden font-sans antialiased tracking-tight`}
      >
        <AuthSessionShell>{children}</AuthSessionShell>
      </body>
    </html>
  );
}
