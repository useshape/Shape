import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import ClientLayout from "@/app/client-layout";

export const metadata: Metadata = {
  title: "Shape",
  description: "Agent workspace",
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
      <body className={`${GeistSans.className} h-full flex flex-col overflow-hidden bg-background text-text-primary antialiased`}>
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
