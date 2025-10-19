/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',            // tells Next to generate a static site
  images: { unoptimized: true } // needed if you use <Image> with export
};
export default nextConfig;