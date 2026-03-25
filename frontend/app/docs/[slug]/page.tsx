import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { DocsLayout } from "@/components/docs-layout";
import { DOC_SECTIONS } from "@/lib/docs-config";

const DOCS_DIR = path.join(process.cwd(), "..", "docs");

export function generateStaticParams() {
  return fs
    .readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => ({ slug: f.replace(".md", "") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const section = DOC_SECTIONS.find((s) => s.slug === slug);
  return {
    title: section ? `${section.title} — Merlin Docs` : "Merlin Docs",
  };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const filePath = path.join(DOCS_DIR, `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    notFound();
  }

  const content = fs.readFileSync(filePath, "utf-8");

  return (
    <DocsLayout
      sectionTitle="User Docs"
      sections={DOC_SECTIONS}
      currentSlug={slug}
      basePath="/docs"
    >
      <MarkdownRenderer content={content} />
    </DocsLayout>
  );
}
