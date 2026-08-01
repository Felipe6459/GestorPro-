import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Next.js's own default (1 MB) is smaller than
      // MAX_ATTACHMENT_SIZE_BYTES (10 MB, see src/lib/storage/attachments-config.ts)
      // — without raising this, a legitimate 2-10MB upload would be
      // rejected by the framework with a raw 413 before ever reaching
      // validateAttachmentFile(). Set above 10MB to leave headroom for
      // multipart/form-data overhead around the raw file bytes.
      bodySizeLimit: "12mb",
    },
    // This app's middleware (src/middleware.ts) makes every request go
    // through the proxy body-buffering path, whose own default cap is also
    // 10MB — identical to our attachment size limit, so a file at or near
    // 10MB was silently truncated mid-multipart-body before reaching the
    // Server Action at all (surfacing as a raw "Unexpected end of form"
    // parse error instead of validateAttachmentFile()'s clean rejection).
    // Raised in lockstep with bodySizeLimit above so our own validation is
    // always what decides accept/reject, never this buffering cap.
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
