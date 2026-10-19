import type { Metadata } from "next";
import { Inter, JetBrains_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { dirOf } from "@/lib/i18n/config";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "AEGIS — HSSE Command Platform",
    template: "%s · AEGIS",
  },
  description:
    "Autonomous Environment Guard & Intelligence System. Real-time HSSE monitoring, predictive safety analytics, and autonomous incident response.",
  keywords: ["HSSE", "Safety", "Command Center", "AEGIS", "Oman", "Industrial Safety"],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AEGIS",
  },
};

export const viewport = {
  themeColor: "#00d4d8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      suppressHydrationWarning
      className={`${inter.variable} ${plexArabic.variable} ${jetbrains.variable} dark`}
    >
      <body className="font-sans antialiased">
        {/* Register PWA service worker — silent if blocked */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                // Production HTTPS — register. Dev / HTTP — unregister anything
                // a previous prod build may have planted, to avoid stale-cache hell.
                if (location.protocol === 'https:' && '${process.env.NODE_ENV}' === 'production') {
                  window.addEventListener('load', () => {
                    navigator.serviceWorker.register('/sw.js').catch(() => {});
                  });
                } else {
                  navigator.serviceWorker.getRegistrations().then((regs) => {
                    regs.forEach((r) => r.unregister());
                  }).catch(() => {});
                  // Also drop any caches the SW left behind so HMR works
                  if ('caches' in window) {
                    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
                  }
                }
              }
            `,
          }}
        />
        <I18nProvider locale={locale} messages={getMessages(locale)}>
          <AuthProvider>
            <ThemeProvider attribute="class" defaultTheme="dark">
              {children}
              <Toaster richColors position={locale === "ar" ? "top-left" : "top-right"} />
            </ThemeProvider>
          </AuthProvider>
        </I18nProvider>
      </body>
    </html>
  );
}