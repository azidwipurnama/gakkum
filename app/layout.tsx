import type { Metadata } from "next";
import { NetworkProvider } from "@/contexts/NetworkContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Network Monitor - Wing C Gakkum",
  description: "Network Monitoring Dashboard Wing C",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <NetworkProvider>
          {children}
        </NetworkProvider>
      </body>
    </html>
  );
}
