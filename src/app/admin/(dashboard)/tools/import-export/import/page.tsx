"use client";
import { Suspense } from "react";
import ImportWizard from "@/components/admin/import-export/ImportWizard";

export default function ImportWizardPage() {
  return (
    <Suspense fallback={null}>
      <ImportWizard />
    </Suspense>
  );
}
