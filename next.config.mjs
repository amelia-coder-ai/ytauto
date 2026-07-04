/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverComponentsExternalPackages: [
            "@remotion/bundler",
            "@remotion/renderer",
            "@remotion/cli",
            "@rspack/core",
            "@rspack/binding",
            "esbuild",
            "@ffmpeg-installer/ffmpeg",
            "@ffprobe-installer/ffprobe",
        ],
    },
};

export default nextConfig;
