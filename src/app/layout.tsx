import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { APP_NAME, APP_DESCRIPTION, APP_TAGLINE } from "@/lib/constants";
import { Toaster } from "@/components/ui/sonner";

/*
 * Inter carries the UI. The explicit weight range comes from main and
 * is worth keeping — the design system uses 500/600/700 for labels,
 * headings and metrics, and without it those weights get synthesised.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

/*
 * Monospace is not decorative here: tracking IDs, complaint numbers
 * and coordinates are rendered in it so digits align column-wise.
 */
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Nested pages set their own title; this frames it consistently.
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [
    "civic",
    "complaints",
    "government",
    "Smart India Hackathon",
    APP_NAME,
  ],
  authors: [{ name: `${APP_NAME} Team` }],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
         * Scroll-reveal animations render their hidden state on the
         * server. Without JavaScript the reveal never fires, so force
         * that content visible rather than leaving the page blank.
         */}
        <noscript>
          <style>{`[data-reveal]{opacity:1 !important;transform:none !important;}`}</style>
        </noscript>
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
