import type { Metadata } from "next";
import { Bodoni_Moda, EB_Garamond } from "next/font/google";
import "./globals.css";

const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const garamond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Holy Bible — open it and read",
  description:
    "A Bible on a table. Turn to any of the sixty-six books, click to open it, and read the World English Bible.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${bodoni.variable} ${garamond.variable} antialiased`}>{children}</body>
    </html>
  );
}
