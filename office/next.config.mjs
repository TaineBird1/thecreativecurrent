/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: every byte is a file on a CDN. Deploys free to Cloudflare
  // Pages or GitHub Pages with no adapter and no server. All data comes live
  // from Convex over a websocket, so there is nothing for a Next server to do.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
