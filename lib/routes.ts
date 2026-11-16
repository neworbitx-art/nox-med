/** Public site vs. interactive demo URL layout. Keep in sync with next.config.ts redirects. */
export const DEMO_BASE = "/demo";
export const ROUTES = {
  home: "/",
  missions: "/missions",
  about: "/about",
  demo: DEMO_BASE,
  demoMed: `${DEMO_BASE}/med`,
} as const;
