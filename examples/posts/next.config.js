/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['randomuser.me', 'www.gravatar.com'],
  },
};

module.exports = nextConfig;
