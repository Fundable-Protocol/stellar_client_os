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
import { I18nProvider } from "@/i18n/I18nProvider";
import { getTextDirection } from "@/i18n/config";
import { getRequestUiLocale } from "@/i18n/server";

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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getRequestUiLocale();

  return (
    <html lang={locale} dir={getTextDirection(locale)} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${bricolageGrotesque.variable} antialiased`}
      >
        <I18nProvider initialLocale={locale}>
        <HighContrastProvider>
          <ReactQueryProvider>
            <StellarWalletProvider>
              <SocialProvider>
                <RootErrorBoundary>
                  <Navbar />
                  <AppProvider>
                    {children}
                  </AppProvider>
                  <WalletModal />
                  <SmartAppBanner />
                </RootErrorBoundary>
              </SocialProvider>
            </StellarWalletProvider>
          </ReactQueryProvider>
        </HighContrastProvider>
        </I18nProvider>
        <ToastProvider />
      </body>
    </html>
  );
}
