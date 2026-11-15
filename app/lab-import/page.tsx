"use client";
import { useState } from "react";
import { PageHeader, Segmented } from "@/components/ui";
import { CsvImport } from "@/components/csvimport";
import { ReportImport } from "@/components/reportimport";
import { UploadedTrends } from "@/components/uploadedtrends";

export default function LabImport() {
  const [mode, setMode] = useState<"report" | "csv">("report");
  return (
    <>
      <PageHeader code="MOD-IMP" title="Laboratory Import"
        desc="Bring blood-gas results into NOX MED: transcribe an ABL90-style report (PDF or image) with mandatory verification, or load a CSV export into the crew record. Data stays in this browser." />
      <div className="mb-4"><Segmented value={mode} onChange={setMode} label="Source" options={[{ value: "report", label: "ABL90 report (PDF / image)" }, { value: "csv", label: "CSV into crew record" }]} /></div>
      {mode === "report" ? <div className="space-y-4"><ReportImport /><UploadedTrends /></div> : <CsvImport />}
    </>
  );
}
