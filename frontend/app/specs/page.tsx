import fs from "fs";
import path from "path";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { DocsLayout } from "@/components/docs-layout";
import { SPEC_SECTIONS } from "@/lib/docs-config";

export const metadata = {
  title: "Feature Specs — Merlin",
  description: "Merlin feature specifications: detailed technical specs for each product feature.",
};

export default function SpecsPage() {
  const content = fs.readFileSync(
    path.join(process.cwd(), "..", "specs", "features", "README.md"),
    "utf-8"
  );

  return (
    <DocsLayout
      sectionTitle="Feature Specs"
      sections={SPEC_SECTIONS}
      currentSlug="README"
      basePath="/specs"
    >
      <MarkdownRenderer content={content} />
    </DocsLayout>
  );
}
