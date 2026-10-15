import type { Metadata } from "next";
import "./globals.css";
import { appName } from "@/config";

export const metadata: Metadata = {
  title: { default: appName, template: `%s · ${appName}` },
  description: "AI-assisted homework marking. The teacher decides.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-screen bg-white text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-gray-900"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
