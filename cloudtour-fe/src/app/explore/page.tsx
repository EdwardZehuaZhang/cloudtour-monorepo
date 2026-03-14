import type { Metadata } from "next";
import { Suspense } from "react";
import { ExplorePage } from "@/components/explore/explore-page";

export const metadata: Metadata = {
  title: "Explore Tours",
  description:
    "Browse and discover immersive Gaussian splatting virtual tours. Filter by category, location, and more.",
  openGraph: {
    title: "Explore Tours — CloudTour",
    description:
      "Browse and discover immersive Gaussian splatting virtual tours. Filter by category, location, and more.",
    url: "/explore",
  },
  twitter: {
    card: "summary",
    title: "Explore Tours — CloudTour",
    description:
      "Browse and discover immersive Gaussian splatting virtual tours. Filter by category, location, and more.",
  },
};

export default function ExploreRoute() {
  return (
    <Suspense>
      <ExplorePage />
    </Suspense>
  );
}
