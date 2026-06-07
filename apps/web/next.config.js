/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@docflow/shared', 'pdfjs-dist'],
  webpack: (config) => {
    // @docflow/shared uses TS ESM imports (./foo.js) while web resolves source .ts files.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

module.exports = nextConfig;
