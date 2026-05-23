import type { Metadata } from "next";
// import { Geist, Geist_Mono, Inter } from "next/font/google";
import Navbar from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { WalletProvider } from "@/lib/contexts/WalletContext";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = {
  variable: "--font-geist-sans",
};

const geistMono = {
  variable: "--font-geist-mono",
};

const inter = {
  variable: "--font-inter",
};

export const metadata: Metadata = {
  title: "OracleDesk | Institutional-Grade AI Prediction Terminal",
  description: "The world's most accurate AI-driven prediction terminal.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const cookies = headersList.get("cookie");

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col font-body-md text-on-surface">
        <WalletProvider cookies={cookies}>
          <Navbar />
          {children}
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
