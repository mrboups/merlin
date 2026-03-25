import fs from "fs";
import path from "path";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { DocsLayout } from "@/components/docs-layout";
import { DEV_SECTIONS } from "@/lib/docs-config";

export const metadata = {
  title: "Developer Docs — Merlin",
  description: "Merlin developer documentation: architecture, APIs, deployment, and integration guides.",
};

export default function DevPage() {
  const content = fs.readFileSync(
    path.join(process.cwd(), "..", "dev", "README.md"),
    "utf-8"
  );

  return (
    <DocsLayout
      sectionTitle="Developer Docs"
      sections={DEV_SECTIONS}
      currentSlug="README"
      basePath="/dev"
    >
      <MarkdownRenderer content={content} />
    </DocsLayout>
  );
}
