import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
      <head>
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-78E8BKC09D" />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-78E8BKC09D');`,
          }}
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
