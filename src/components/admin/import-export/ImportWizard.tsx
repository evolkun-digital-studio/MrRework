"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/admin/ui";
import StepIndicator, { type WizardStepKey } from "./StepIndicator";
import TypeStep from "./steps/TypeStep";
import UploadStep from "./steps/UploadStep";
import PreviewStep from "./steps/PreviewStep";
import AnalysisStep from "./steps/AnalysisStep";
import MappingStep from "./steps/MappingStep";
import ValidationStep from "./steps/ValidationStep";
import RunStep from "./steps/RunStep";
import ReportStep from "./steps/ReportStep";
import type { ImportJobClient, RegistryImporter, ValidationResultClient } from "./types";

// The one wizard component every importer shares. It has no Product-specific
// logic of its own — it only calls the generic /api/admin/import-export/**
// routes and renders whatever targetFields the selected importer's registry
// entry declares. A future Categories/Customers/Orders importer reuses this
// file unchanged; it just needs status: "available" in the registry.
export default function ImportWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [importers, setImporters] = useState<RegistryImporter[] | null>(null);
  const [step, setStep] = useState<WizardStepKey>("type");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [job, setJob] = useState<ImportJobClient | null>(null);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [mappingError, setMappingError] = useState("");
  const [validation, setValidation] = useState<ValidationResultClient | null>(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    fetch("/api/admin/import-export/registry").then((res) => res.json()).then((data) => {
      const items: RegistryImporter[] = data.items ?? [];
      setImporters(items);
      const fromQuery = searchParams?.get("type");
      if (fromQuery && items.find((i) => i.key === fromQuery && i.status === "available")) {
        setSelectedType(fromQuery);
        setStep("upload");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectType(key: string) {
    setSelectedType(key);
    setStep("upload");
  }

  function handleUploaded(newJob: ImportJobClient) {
    setJob(newJob);
    setStep("preview");
  }

  async function saveMappingAndValidate(mapping: Record<string, string>, duplicateStrategy: "update" | "skip") {
    if (!job) return;
    setMappingSaving(true);
    setMappingError("");
    try {
      const res = await fetch(`/api/admin/import-export/jobs/${job._id}/mapping`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: mapping, duplicateStrategy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save mapping.");
      setJob(data.job);
      setStep("validation");
      setValidating(true);
      const vRes = await fetch(`/api/admin/import-export/jobs/${job._id}/validate`, { method: "POST" });
      const vData = await vRes.json();
      if (!vRes.ok) throw new Error(vData.error || "Validation failed.");
      setValidation(vData.validation);
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : "Something went wrong.");
      setStep("mapping");
    } finally {
      setMappingSaving(false);
      setValidating(false);
    }
  }

  function startImport() {
    setStep("run");
  }

  function handleRunDone(finishedJob: ImportJobClient) {
    setJob(finishedJob);
    setStep("report");
  }

  async function cancelWizard() {
    if (job && ["uploaded", "mapped", "validated"].includes(job.status)) {
      await fetch(`/api/admin/import-export/jobs/${job._id}`, { method: "DELETE" });
    }
    router.push("/admin/tools/import-export");
  }

  function importAnother() {
    setJob(null);
    setValidation(null);
    setStep("type");
    router.push("/admin/tools/import-export/import");
  }

  const activeImporter = importers?.find((i) => i.key === selectedType) ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold">Import Wizard</h1>
        <p className="text-[12.5px] text-stone mt-1">{activeImporter ? `Importing: ${activeImporter.label}` : "Choose a data type to begin."}</p>
      </div>

      <Card><StepIndicator current={step} /></Card>

      <Card>
        {step === "type" && <TypeStep importers={importers} selected={selectedType} onSelect={selectType} />}

        {step === "upload" && selectedType && (
          <UploadStep type={selectedType} acceptedExtensions={activeImporter?.acceptedExtensions ?? [".csv"]} onUploaded={handleUploaded} />
        )}

        {step === "preview" && job && (
          <PreviewStep job={job} onPrepared={setJob} onContinue={() => setStep("analysis")} onCancel={cancelWizard} />
        )}

        {step === "analysis" && job && (
          <AnalysisStep job={job} onContinue={() => setStep("mapping")} onBack={() => setStep("preview")} />
        )}

        {step === "mapping" && job && activeImporter && (
          <MappingStep
            job={job}
            targetFields={activeImporter.targetFields}
            saving={mappingSaving || validating}
            error={mappingError}
            onContinue={saveMappingAndValidate}
            onBack={() => setStep("analysis")}
          />
        )}

        {step === "validation" && (
          <ValidationStep
            validation={validation}
            validating={validating}
            onContinue={startImport}
            onBack={() => { setStep("mapping"); }}
            onCancel={cancelWizard}
          />
        )}

        {step === "run" && job && <RunStep job={job} onDone={handleRunDone} />}

        {step === "report" && job && <ReportStep job={job} onImportAnother={importAnother} />}
      </Card>
    </div>
  );
}
