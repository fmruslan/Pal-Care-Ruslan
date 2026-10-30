import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { CareOSProvider } from "@/components/careos/provider";
import { InsightsControlProvider } from "@/components/intelligence/customer-control";
import { parseCareConfig } from "@/lib/careos/config";
import "./globals.css";

const inter = localFont({
  src: "../../public/fonts/InterVariable-v4.1.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "Pal Care — Everything you own. All cared for.",
    template: "%s · Pal Care",
  },
  description:
    "Your personal purchase care space. An independent PayPal AI Hackathon project powered by CareOS.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F9FC" },
    { media: "(prefers-color-scheme: dark)", color: "#35414C" },
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
  const liveMode = mode === "subscription" || mode === "responses";
  const ownerMode = process.env.CAREOS_OWNER_MODE === "true";
  const expires = Date.parse(process.env.CAREOS_EVALUATION_EXPIRES_AT ?? "");
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body>
        <ThemeProvider>
          <a
            href="#main-content"
            className="sr-only fixed top-3 left-3 z-50 rounded-xl bg-primary px-5 py-3 text-primary-foreground focus:not-sr-only"
          >
            Skip to content
          </a>
          <InsightsControlProvider>
            <CareOSProvider
              mode={mode}
              ownerAccess={ownerMode}
              aiExpiresAt={
                !ownerMode && liveMode && Number.isFinite(expires)
                  ? expires
                  : undefined
              }
              aiAccessDisabled={
                liveMode &&
                (ownerMode
                  ? process.env.CAREOS_STANDING_AI_ENABLED !== "true"
                  : process.env.CAREOS_EVALUATION_ENABLED !== "true")
              }
            >
              {children}
            </CareOSProvider>
          </InsightsControlProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
