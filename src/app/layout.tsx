import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "@/components/theme-provider";
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

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFBFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1020" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={GeistSans.variable}>
      <body>
        <ThemeProvider>
          <a
            href="#main-content"
            className="sr-only fixed top-3 left-3 z-50 rounded-xl bg-primary px-5 py-3 text-primary-foreground focus:not-sr-only"
          >
            Skip to content
          </a>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
