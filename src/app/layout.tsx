import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/auth-provider";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrains.variable} dark`}
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
        <LanguageProvider>
          <AuthProvider>
            <ThemeProvider attribute="class" defaultTheme="dark">
              {children}
              <Toaster richColors position="top-right" />
            </ThemeProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}