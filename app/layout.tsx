import type { Metadata } from "next";
import "@fontsource-variable/inter";
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
      className="dark h-full overflow-hidden text-sm bg-transparent text-text-primary"
      suppressHydrationWarning
    >
      <body className="h-full flex flex-col overflow-hidden bg-transparent text-text-primary antialiased font-sans">
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
