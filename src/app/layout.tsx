import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import "./public-theme.css";
import { ThemeProvider } from "@/components/theme-provider";
import { themeInitScript } from "@/lib/theme";
import { AppShell } from "@/components/app-shell";
import {
  JOBS_PORTAL_SHARE_DESCRIPTION,
  JOBS_PORTAL_SHARE_IMAGE,
  JOBS_PORTAL_SHARE_PATH,
  JOBS_PORTAL_SHARE_TITLE,
  JOBS_PORTAL_SITE_URL,
} from "@/lib/share-metadata";

export const metadata: Metadata = {
  metadataBase: new URL(JOBS_PORTAL_SITE_URL),
  title: JOBS_PORTAL_SHARE_TITLE,
  description: JOBS_PORTAL_SHARE_DESCRIPTION,
  alternates: {
    canonical: JOBS_PORTAL_SHARE_PATH,
  },
  applicationName: JOBS_PORTAL_SHARE_TITLE,
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
  openGraph: {
    title: JOBS_PORTAL_SHARE_TITLE,
    description: JOBS_PORTAL_SHARE_DESCRIPTION,
    url: JOBS_PORTAL_SHARE_PATH,
    siteName: JOBS_PORTAL_SHARE_TITLE,
    images: [JOBS_PORTAL_SHARE_IMAGE],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: JOBS_PORTAL_SHARE_TITLE,
    description: JOBS_PORTAL_SHARE_DESCRIPTION,
    images: [JOBS_PORTAL_SHARE_IMAGE.url],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInitScript }} /></head>
      <body
        className="bg-background text-foreground font-sans antialiased"
        suppressHydrationWarning
      >
        <ThemeProvider><AppShell>{children}</AppShell></ThemeProvider>
      </body>
    </html>
  );
}
