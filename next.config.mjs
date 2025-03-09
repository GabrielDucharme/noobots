/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config) => {
        config.externals.push({
            'utf-8-validate': 'commonjs utf-8-validate',
            'bufferutil': 'commonjs bufferutil',
        });
        return config;
    },
    experimental: {
        serverActions: true,
    },
    // Enable static exports for deployment platforms that need it
    output: 'export',
    // Disable server-side image optimization since we're using static export
    images: { unoptimized: true },
};

export default nextConfig;
