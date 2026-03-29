import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { StellarWalletProvider } from "../providers/StellarWalletProvider";
import { Navbar } from "@/components/organisms/navbar";
import { WalletModal } from "@/components/organisms/wallet-modal";
import AppProvider from "@/providers/app-provider";
import { ToastProvider } from "@/providers/ToastProvider";
import ReactQueryProvider from "@/providers/ReactQueryProvider";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ErrorFallback } from "@/components/ui/error-fallback";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage-grotesque",
});


export const metadata: Metadata = {
  title: "Fundable Stellar - Decentralized Payment Streams",
  description: "Create seamless payment streams and token distributions on the Stellar blockchain",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${bricolageGrotesque.variable} antialiased`}
      >
        <ReactQueryProvider>
          <StellarWalletProvider>
            <ErrorBoundary
              boundaryName="root-layout"
              fallback={({ error, reset }) => (
                <ErrorFallback
                  title="Application Error"
                  description="Something unexpected happened in the app shell."
                  error={error}
                  onRetry={reset}
                  className="m-4"
                />
              )}
            >
              <Navbar />
              <AppProvider>
                {children}
              </AppProvider>
              <WalletModal />
            </ErrorBoundary>
          </StellarWalletProvider>
        </ReactQueryProvider>
        <ToastProvider />
      </body>
    </html>
  );
}
