/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
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
