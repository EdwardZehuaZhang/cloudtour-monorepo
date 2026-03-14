import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cloudtour.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "CloudTour — Spatial tours for the places worth remembering",
    template: "%s — CloudTour",
  },
  description:
    "Create and share immersive Gaussian splatting virtual tours with CloudTour.",
  openGraph: {
    type: "website",
    siteName: "CloudTour",
    title: "CloudTour — Spatial tours for the places worth remembering",
    description:
      "Create and share immersive Gaussian splatting virtual tours with CloudTour.",
    url: appUrl,
  },
  twitter: {
    card: "summary",
    title: "CloudTour — Spatial tours for the places worth remembering",
    description:
      "Create and share immersive Gaussian splatting virtual tours with CloudTour.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${GeistSans.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
