/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow a separate build directory (e.g. the Playwright e2e server) so a test
  // run can coexist with `npm run dev` instead of clobbering the same `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
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
