/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained production bundle (server.js + traced deps only) —
  // tiny Docker images and fast cold starts when we containerize.
  output: 'standalone',
  poweredByHeader: false,
  compress: true,
  // Dev server is reached through the Cloudflare tunnel (shop.careerlyft.ai).
  allowedDevOrigins: ['shop.careerlyft.ai'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'api.chapa.co' },
      { protocol: 'https', hostname: 'pub-17d7ca5d552340839f06a8d61b7ebe59.r2.dev' },
    ],
    unoptimized: true,
  },
};

module.exports = nextConfig;
