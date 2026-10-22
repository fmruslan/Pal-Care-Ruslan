import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Pal Care — Everything you buy. Taken care of.",
    template: "%s · Pal Care",
  },
  description:
    "Your personal purchase care space. An independent PayPal AI Hackathon project powered by CareOS.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only fixed top-3 left-3 z-50 rounded-xl bg-primary px-5 py-3 text-white focus:not-sr-only"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
