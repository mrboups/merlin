import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { DocsLayout } from "@/components/docs-layout";
import { SPEC_SECTIONS } from "@/lib/docs-config";

const SPECS_DIR = path.join(process.cwd(), "..", "specs", "features");

export function generateStaticParams() {
  return fs
    .readdirSync(SPECS_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => ({ slug: f.replace(".md", "") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const section = SPEC_SECTIONS.find((s) => s.slug === slug);
  return {
    title: section ? `${section.title} — Merlin Specs` : "Merlin Specs",
  };
}

export default async function SpecPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const filePath = path.join(SPECS_DIR, `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    notFound();
  }

  const content = fs.readFileSync(filePath, "utf-8");

  return (
    <DocsLayout
      sectionTitle="Feature Specs"
      sections={SPEC_SECTIONS}
      currentSlug={slug}
      basePath="/specs"
    >
      <MarkdownRenderer content={content} />
    </DocsLayout>
  );
}
