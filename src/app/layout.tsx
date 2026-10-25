import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SunoSehat — Your Health, In Your Language",
  description: "A voice-first companion for understanding health documents and remembering medicines.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
