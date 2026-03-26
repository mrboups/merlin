import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7c3aed",
  // Note: do NOT set maximumScale=1 or userScalable=false — it breaks passkey prompts on iOS Safari
};

export const metadata: Metadata = {
  title: "Merlin",
  description:
    "Privacy-preserving non-custodial wallet for stocks and crypto",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      {GA_ID && (
        <head>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
          </Script>
        </head>
      )}
      <body className={inter.className}>{children}</body>
    </html>
  );
}
