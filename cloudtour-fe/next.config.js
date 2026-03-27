/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@cloudtour/ui", "@cloudtour/db", "@cloudtour/types"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "siwkrxtdijvutuerunzv.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

module.exports = nextConfig;
