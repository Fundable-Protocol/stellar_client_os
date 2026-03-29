import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { StellarWalletProvider } from "../providers/StellarWalletProvider";
import { Navbar } from "@/components/organisms/navbar";
import { WalletModal } from "@/components/organisms/wallet-modal";
import AppProvider from "@/providers/app-provider";
import { ToastProvider } from "@/providers/ToastProvider";
import ReactQueryProvider from "@/providers/ReactQueryProvider";
import { ConfigurationErrorScreen } from "@/components/system/configuration-error-screen";
import { getEnvValidationResult, formatEnvValidationError } from "@/lib/env-validation";

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
  const envValidation = getEnvValidationResult();

  if (!envValidation.success) {
    if (process.env.NODE_ENV === "production") {
      console.error(formatEnvValidationError(envValidation.error.issues));
    }

    return (
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} ${bricolageGrotesque.variable} antialiased`}
        >
          <ConfigurationErrorScreen
            issues={envValidation.error.issues}
            isDevelopment={process.env.NODE_ENV !== "production"}
          />
        </body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${bricolageGrotesque.variable} antialiased`}
      >
        <ReactQueryProvider>
          <StellarWalletProvider>
            <Navbar />
            <AppProvider>
              {children}
            </AppProvider>
            <WalletModal />
          </StellarWalletProvider>
        </ReactQueryProvider>
        <ToastProvider />
      </body>
    </html>
  );
}
