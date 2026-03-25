import fs from "fs";
import path from "path";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { DocsLayout } from "@/components/docs-layout";

export const metadata = {
  title: "Whitepaper — Merlin",
  description: "The Merlin technical whitepaper: privacy-preserving non-custodial wallet architecture.",
};

export default function WhitepaperPage() {
  const content = fs.readFileSync(
    path.join(process.cwd(), "..", "whitepaper", "merlin-whitepaper.md"),
    "utf-8"
  );

  return (
    <DocsLayout sectionTitle="Whitepaper">
      <MarkdownRenderer content={content} />
    </DocsLayout>
  );
}
