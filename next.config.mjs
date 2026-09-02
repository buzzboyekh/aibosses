/** @type {import('next').NextConfig} */
const nextConfig = {
  // Default server-action body limit is 1MB; a phone photo of an invoice is
  // routinely 3-8MB. Without this, /documents 413s before uploadDocument()
  // ever runs — see app/documents/UploadForm.tsx's matching client-side check.
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};
export default nextConfig;
