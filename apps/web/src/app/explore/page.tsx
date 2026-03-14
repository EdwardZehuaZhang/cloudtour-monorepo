import type { Metadata } from "next";
import { ExplorePage } from "@/components/explore/explore-page";

export const metadata: Metadata = {
  title: "Explore Tours — CloudTour",
  description:
    "Browse and discover immersive Gaussian splatting virtual tours. Filter by category, location, and more.",
};

export default function ExploreRoute() {
  return <ExplorePage />;
}
