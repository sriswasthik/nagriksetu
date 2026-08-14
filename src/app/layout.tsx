import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "CityTrace — Civic Issue Reporting Platform",
    template: "%s | CityTrace",
  },
  description:
    "CityTrace is an AI-powered civic operations platform that connects citizens with government authorities to report and resolve civic issues efficiently.",
  keywords: ["civic", "complaints", "government", "Smart India Hackathon", "CityTrace"],
  authors: [{ name: "CityTrace Team" }],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
