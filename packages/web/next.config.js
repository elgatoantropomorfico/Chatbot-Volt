/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: '/presupuesto',
        destination: '/chatbot_presupuesto2026.pdf',
        permanent: false,
      },
    ];
  },
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
