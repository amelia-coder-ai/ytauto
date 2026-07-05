/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverComponentsExternalPackages: [
            "esbuild",
        ],
    },
};

export default nextConfig;
