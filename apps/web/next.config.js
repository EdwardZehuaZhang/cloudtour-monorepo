/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@cloudtour/ui", "@cloudtour/db", "@cloudtour/types"],
};

module.exports = nextConfig;
