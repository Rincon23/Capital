import type { NextConfig } from 'next';

/** Comma-separated hostnames the app is served from behind a reverse proxy / tunnel
 *  (Tailscale, Cloudflare, nginx…). Needed so Server Actions (login, etc.) aren't
 *  rejected by Next's CSRF check when the request Origin differs from the local Host.
 *  Example: APP_ALLOWED_ORIGINS=capital.my-tailnet.ts.net,capital.exemplo.com */
const allowedOrigins = (process.env.APP_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  // Self-contained server bundle for `docker` / bare Node deploys (see README "Publicar").
  output: 'standalone',
  // The app uses no <Image> components; skip the optimizer (and its `sharp` dependency).
  images: { unoptimized: true },
  // Devices testing the dev server over the LAN / VPN mesh (Tailscale, Radmin, …).
  // Dev-only; add your own host here if HMR is blocked for a cross-origin request.
  allowedDevOrigins: ['100.77.129.51', '26.196.168.235'],
  experimental: {
    serverActions: { allowedOrigins },
  },
};

export default nextConfig;
