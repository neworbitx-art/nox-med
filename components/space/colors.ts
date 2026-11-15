import type { RouteKind } from "@/lib/missions";
export const ROUTE_COLOR: Record<RouteKind, string> = { "earth-orbit": "#38C9F4", "lunar-transfer": "#A78BFA", "earth-mars-transfer": "#F5B642", "mars-orbit": "#FB7185" };
export interface HoverInfo { kind: "ship" | "checkpoint" | "body"; missionId?: string; cpId?: string; bodyId?: string; x: number; y: number }
