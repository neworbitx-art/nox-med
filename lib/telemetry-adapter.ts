import { dayToDate, environment, mission } from "./data";
import type { EnvironmentalSample } from "./types";

/**
 * Telemetry adapter: the seam where WebSocket, Server-Sent Events, polling or stored-replay sources plug in.
 * This prototype ships only a local replay adapter over the bundled dataset. It is NOT a live connection.
 */
export type AdapterKind = "replay" | "polling" | "websocket" | "sse";
export interface TelemetrySnapshot {
  missionId: string;
  /** Date of the newest sample (ISO date) or null when the mission has no telemetry */
  timestamp: string | null;
  missionDay: number | null;
  cabin: EnvironmentalSample | null;
  source: string;
  /** True only for a verified real-time stream. Local replays are never live. */
  live: boolean;
}
export interface TelemetryAdapter {
  id: string;
  kind: AdapterKind;
  latest(missionId: string): TelemetrySnapshot;
  /** Subscribe to updates; returns an unsubscribe function. Replay adapters emit once. */
  subscribe(missionId: string, cb: (s: TelemetrySnapshot) => void): () => void;
}

export const localReplayAdapter: TelemetryAdapter = {
  id: "local-replay", kind: "replay",
  latest(missionId) {
    if (missionId !== mission.id) return { missionId, timestamp: null, missionDay: null, cabin: null, source: "No telemetry source for this mission", live: false };
    const c = environment[environment.length - 1];
    return { missionId, timestamp: dayToDate(c.missionDay), missionDay: c.missionDay, cabin: c, source: "Local demonstration dataset (replay)", live: false };
  },
  subscribe(missionId, cb) { cb(this.latest(missionId)); return () => {}; },
};

export let activeAdapter: TelemetryAdapter = localReplayAdapter;
export const useAdapter = (a: TelemetryAdapter) => { activeAdapter = a; };
export const freshness = (s: TelemetrySnapshot) => (s.timestamp === null ? "No telemetry" : s.live ? "Live" : "Snapshot, not live");
