import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { ThemeProvider } from "@/components/theme-provider";
import { CareOSProvider } from "@/components/careos/provider";
import { InsightsControlProvider } from "@/components/intelligence/customer-control";
import { parseCareConfig } from "@/lib/careos/config";
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
    { media: "(prefers-color-scheme: light)", color: "#F7F9FC" },
    { media: "(prefers-color-scheme: dark)", color: "#0E111D" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let mode:
    "fixture" | "disabled" | "responses" | "subscription" | "unavailable";
  try {
    mode = parseCareConfig(process.env).mode;
  } catch {
    mode = "unavailable";
  }
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
          <InsightsControlProvider>
            <CareOSProvider mode={mode}>{children}</CareOSProvider>
          </InsightsControlProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
