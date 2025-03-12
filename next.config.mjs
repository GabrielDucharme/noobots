/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config) => {
        // Add externals for WebSocket libraries
        config.externals.push({
            'utf-8-validate': 'commonjs utf-8-validate',
            'bufferutil': 'commonjs bufferutil',
        });
        
        return config;
    },
    experimental: {
        // Use serverActions correctly (object instead of boolean)
        serverActions: {
            allowedOrigins: ['localhost:3000'],
        },
    },
    // Configure for dynamic API routes while keeping static where possible
    // Use 'standalone' instead of 'export' for hybrid approach
    output: 'standalone',
    // Config for image optimization
    images: { 
        domains: ['localhost'],
        formats: ['image/avif', 'image/webp'],
    },
    // These options help with API route handling
    skipTrailingSlashRedirect: true,
    skipMiddlewareUrlNormalize: true,
};

export default nextConfig;
