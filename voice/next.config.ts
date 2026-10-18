import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: { '/*': ['.env', '.env.*'] },
  serverExternalPackages: ['pg', 'pg-boss'],
  poweredByHeader: false,
};
export default config;
