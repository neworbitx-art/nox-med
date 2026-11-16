import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./marketing.css";
import { SiteNav } from "@/components/marketing/SiteNav";
import { SiteFooter } from "@/components/marketing/SiteFooter";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.neworbitx.com"),
  title: { default: "NOX — New Orbit Exploration", template: "%s · NOX" },
  description: "The next orbit starts here. NOX builds health intelligence for long-duration human spaceflight.",
  openGraph: { title: "NOX — New Orbit Exploration", description: "The next orbit starts here.", url: "https://www.neworbitx.com", siteName: "NOX", type: "website" },
};

// Separate root layout: the public site shares nothing with the demo's providers, shell or global CSS.
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="mk">
        <SiteNav />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
