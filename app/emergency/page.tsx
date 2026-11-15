"use client";
import { useState } from "react";
import { PageHeader, Segmented } from "@/components/ui";
import { Simulator } from "@/components/simulator";
import { InjectionAnalysis } from "@/components/injectsim";

export default function EmergencySimulator() {
  const [mode, setMode] = useState<"play" | "inject">("play");
  return (
    <>
      <PageHeader code="MOD-EMG" title="Emergency Simulator"
        desc="Play a deterministic emergency scenario in simulated time and watch laboratory results, cabin telemetry and explainable alerts develop together." />
      <div className="mb-4"><Segmented value={mode} onChange={setMode} label="Mode" options={[{ value: "play", label: "Scenario playback" }, { value: "inject", label: "Injection analysis" }]} /></div>
      {mode === "play" ? <Simulator /> : <InjectionAnalysis />}
    </>
  );
}
