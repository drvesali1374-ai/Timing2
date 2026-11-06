import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";

// فونت وزیرمتن — کاملاً محلی، بدون هیچ درخواست خارجی (۶.۹)
const vazir = localFont({
  src: [
    { path: "./fonts/Vazirmatn-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Vazirmatn-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/Vazirmatn-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Vazirmatn-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Vazirmatn-ExtraBold.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-vazir",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: "زمان‌سنجی صنعتی | مطالعات زمان استاندارد خطوط تولید",
  description:
    "نرم‌افزار داخلی زمان‌سنجی صنعتی: ساختار خط تولید، ثبت مشاهدات، ارزیابی وستینگهاوس، زمان نرمال و استاندارد، OPC/FPC و گزارش‌ها — کاملاً آفلاین",
  applicationName: "زمان‌سنجی صنعتی",
  icons: { icon: "/logo.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#070b14" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className={`${vazir.variable} font-sans antialiased bg-background text-foreground`}>
        <Providers>
          {children}
          <Toaster position="bottom-left" richColors closeButton dir="rtl" />
        </Providers>
      </body>
    </html>
  );
}
