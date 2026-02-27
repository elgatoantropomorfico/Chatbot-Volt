/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://chatbot-volt-production.up.railway.app/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
