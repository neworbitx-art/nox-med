import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { MissionProvider } from "@/lib/store";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "NOX MED — Mission Health Intelligence",
  description: "Detect the change before it becomes an emergency. Astronaut health monitoring by NOX — New Orbit Exploration.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MissionProvider>
          <Shell>{children}</Shell>
        </MissionProvider>
      </body>
    </html>
  );
}
