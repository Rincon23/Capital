import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Devices testing the dev server over the LAN / VPN mesh (Tailscale, Radmin, …).
  // Dev-only; add your own host here if HMR is blocked for a cross-origin request.
  allowedDevOrigins: ['100.77.129.51', '26.196.168.235'],
};

export default nextConfig;
