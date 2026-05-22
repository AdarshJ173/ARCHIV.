import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-body",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ARCHIV. — Transcript Intelligence",
  description: "Download YouTube transcripts, build a local knowledge library, and chat with your documents using in-browser AI.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://archiv.vercel.app"),
  icons: [{ rel: "icon", url: "/favicon.png", type: "image/png" }],
  openGraph: {
    title: "ARCHIV. — Transcript Intelligence",
    description: "Download YouTube transcripts, build a local knowledge library, and chat with your documents using in-browser AI.",
    type: "website",
    images: [{ url: "/og-image.png", width: 1254, height: 1254, alt: "ARCHIV. logo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ARCHIV. — Transcript Intelligence",
    description: "Download YouTube transcripts, build a local knowledge library, and chat with your documents using in-browser AI.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${dmSans.variable} ${ibmPlexMono.variable}`} suppressHydrationWarning>
      <body className="min-h-full">
        {children}
        {process.env.NEXT_PUBLIC_BMC_USERNAME && (
          <Script
            src="https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js"
            data-name="BMC-Widget"
            data-cfasync="false"
            data-id={process.env.NEXT_PUBLIC_BMC_USERNAME}
            data-description="Support me on Buy me a coffee!"
            data-message=""
            data-color="#FF813F"
            data-position="Right"
            data-x_margin="18"
            data-y_margin="18"
            strategy="lazyOnload"
          />
        )}
      </body>
    </html>
  );
}
