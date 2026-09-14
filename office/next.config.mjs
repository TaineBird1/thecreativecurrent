import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The parent repo (the marketing site) has its own package-lock.json, so Next
  // walks up, finds two lockfiles, and guesses the wrong workspace root. Saying
  // so explicitly keeps file tracing inside office/ where it belongs — and keeps
  // the build from reaching into a project that has nothing to do with this one.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),

  // Static export: every byte is a file on a CDN. Deploys free to Cloudflare
  // Pages or GitHub Pages with no adapter and no server. All data comes live
  // from Convex over a websocket, so there is nothing for a Next server to do.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
