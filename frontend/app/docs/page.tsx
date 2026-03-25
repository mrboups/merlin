import fs from "fs";
import path from "path";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { DocsLayout } from "@/components/docs-layout";
import { DOC_SECTIONS } from "@/lib/docs-config";

export const metadata = {
  title: "User Docs — Merlin",
  description: "Merlin user documentation: getting started, trading, portfolio, privacy, and more.",
};

export default function DocsPage() {
  const content = fs.readFileSync(
    path.join(process.cwd(), "..", "docs", "README.md"),
    "utf-8"
  );

  return (
    <DocsLayout
      sectionTitle="User Docs"
      sections={DOC_SECTIONS}
      currentSlug="README"
      basePath="/docs"
    >
      <MarkdownRenderer content={content} />
    </DocsLayout>
  );
}
