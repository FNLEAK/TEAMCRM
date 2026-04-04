import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { AuthSessionShell } from "@/components/AuthSessionShell";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
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
        className={`${dmSans.variable} ${geistMono.variable} relative min-h-svh max-w-[100%] overflow-x-hidden font-sans antialiased`}
      >
        <AuthSessionShell>{children}</AuthSessionShell>
      </body>
    </html>
  );
}
