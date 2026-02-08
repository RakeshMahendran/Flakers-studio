import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TamboProviderWrapper } from "@/components/tambo/tambo-provider-wrapper";
import { AuthProvider } from "@/contexts/auth-context";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FlakersStudio - Tambo AI Powered",
  description: "Governance-first AI assistant platform for enterprises, enhanced with Tambo AI dynamic components",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50`}
      >
        <AuthProvider>
          <TamboProviderWrapper>
            {children}
          </TamboProviderWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}
