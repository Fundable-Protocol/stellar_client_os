import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next-font/google";
import "./globals.css";
import { StellarWalletProvider } from "../providers/StellarWalletProvider";
import { Navbar } from "@/components/organisms/navbar";
import { WalletModal } from "@/components/organisms/wallet-modal";
import AppProvider from "@/providers/app-provider";
import { ToastProvider } from "@/providers/ToastProvider";
import ReactQueryProvider from "@/providers/ReactQueryProvider";
import { RootErrorBoundary } from "@/components/ui/root-error-boundary";
import { SocialProvider } from "@/providers/SocialProvider";
import { HighContrastProvider } from "@/providers/HighContrastProvider";
import { SmartAppBanner } from "@/components/SmartAppBanner";
import { PWAFeatures } from "@/components/pwa/PWAFeatures";
import { I18nProvider } from "@/i18n/I18nProvider";
import { getTextDirection } from "@/i18n/config";
import { getRequestUiLocale } from "@/i18n/server";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { ReferralAttributionTracker } from "@/components/campaign/ReferralAttributionTracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage-grotesque",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fundable Stellar - Decentralized Payment Streams",
  description: "Create seamless payment streams and token distributions on the Stellar blockchain",
  applicationName: "Fundable Stellar",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/fundable-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/fundable-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/fundable-192.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/fundable-192.png", sizes: "192x192", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Fundable",
    statusBarStyle: "black-translucent",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestUiLocale();

  return (
    <html lang={locale} dir={getTextDirection(locale)} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#8256ff" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-startup-image" href="/splash/fundable-startup.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem("fundable-theme");const d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){console.error("Unable to initialize the saved theme preference.",e)}`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${bricolageGrotesque.variable} antialiased`}
      >
        <I18nProvider initialLocale={locale}>
          <ThemeProvider>
            <HighContrastProvider>
              <ReactQueryProvider>
                <StellarWalletProvider>
                  <SocialProvider>
                    <RootErrorBoundary>
                      <ReferralAttributionTracker />
                      <Navbar />
                      <AppProvider>{children}</AppProvider>
                      <WalletModal />
                      <SmartAppBanner />
                      <PWAFeatures />
                    </RootErrorBoundary>
                  </SocialProvider>
                </StellarWalletProvider>
              </ReactQueryProvider>
            </HighContrastProvider>
          </ThemeProvider>
        </I18nProvider>
        <ToastProvider />
      </body>
    </html>
  );
}
