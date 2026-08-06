import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import ClientLayout from "@/app/client-layout";

export const metadata: Metadata = {
  title: "Shape",
  description: "Advanced Agentic IDE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} dark h-full overflow-hidden text-sm bg-background text-text-primary`}
      suppressHydrationWarning
    >
      <body className="h-full flex flex-col overflow-hidden bg-background text-text-primary font-sans">
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
