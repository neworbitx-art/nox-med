import type { NextConfig } from "next";

// The interactive demo lives under /demo. Old top-level demo URLs are redirected
// so existing bookmarks and links keep working. (/ and /about are the public site.)
const MODULES = ["mission-control", "blood-gas", "environment", "wearables", "timeline", "emergency", "lab-import", "crew"];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/demo/med", destination: "/demo/mission/NOX-01", permanent: false },
      { source: "/mission/:missionId", destination: "/demo/mission/:missionId", permanent: false },
      ...MODULES.map((m) => ({ source: `/${m}`, destination: `/demo/${m}`, permanent: false })),
    ];
  },
};
export default nextConfig;
