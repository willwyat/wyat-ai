import type { Metadata } from "next";
import { Inter, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const ibmPlexSerif = IBM_Plex_Serif({
  variable: "--font-ibm-plex-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Wyat AI",
  description: "Personal AI Assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Wyat AI" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <link rel="apple-touch-icon" href="/webapp-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/webapp-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/webapp-icon.png" />
        <link rel="apple-touch-icon" sizes="144x144" href="/webapp-icon.png" />
        <link rel="apple-touch-icon" sizes="120x120" href="/webapp-icon.png" />
        <link rel="apple-touch-icon" sizes="114x114" href="/webapp-icon.png" />
        <link rel="apple-touch-icon" sizes="76x76" href="/webapp-icon.png" />
        <link rel="apple-touch-icon" sizes="72x72" href="/webapp-icon.png" />
        <link rel="apple-touch-icon" sizes="60x60" href="/webapp-icon.png" />
        <link rel="apple-touch-icon" sizes="57x57" href="/webapp-icon.png" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body
        className={`${inter.variable} ${ibmPlexSerif.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
