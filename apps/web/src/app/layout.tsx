import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { StellarWalletProvider } from "../providers/StellarWalletProvider";
import { Navbar } from "@/components/organisms/navbar";
import { WalletModal } from "@/components/organisms/wallet-modal";
import AppProvider from "@/providers/app-provider";
import { ToastProvider } from "@/providers/ToastProvider";
import ReactQueryProvider from "@/providers/ReactQueryProvider";
import { RootErrorBoundary } from "@/components/ui/root-error-boundary";

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
            <RootErrorBoundary>
              <Navbar />
              <AppProvider>
                {children}
              </AppProvider>
              <WalletModal />
            </RootErrorBoundary>
          </StellarWalletProvider>
        </ReactQueryProvider>
        <ToastProvider />
      </body>
    </html>
  );
}
