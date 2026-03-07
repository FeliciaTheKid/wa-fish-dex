import type { Metadata, Viewport } from "next"; 
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

// 1. App Identity (The "Manifest" link is what triggers the Install button)
export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "eFish: Washington Archive",
  description: "A gamified fishing quest log for Washington State.",
  manifest: "/manifest.json", 
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "eFish",
  },
};

// 2. Physical Display (This makes your Pixel 10 treat it like an App, not a Tab)
export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, 
  viewportFit: "cover", 
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="bg-[#020617]">
      <body className={`${geistSans.className} antialiased selection:bg-blue-500/30`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark" 
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
