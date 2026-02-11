import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { BatchProvider } from "@/context/BatchContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fal Automation - מחולל תמונות",
  description: "מערכת אוטומציה ליצירת תמונות בכמויות גדולות",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <BatchProvider>
          {children}
          <Toaster position="bottom-left" dir="rtl" richColors />
        </BatchProvider>
      </body>
    </html>
  );
}
