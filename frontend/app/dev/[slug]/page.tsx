import fs from "fs";
import path from "path";
import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { DocsLayout } from "@/components/docs-layout";
import { DEV_SECTIONS } from "@/lib/docs-config";

const DEV_DIR = path.join(process.cwd(), "..", "dev");

export function generateStaticParams() {
  return fs
    .readdirSync(DEV_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => ({ slug: f.replace(".md", "") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const section = DEV_SECTIONS.find((s) => s.slug === slug);
  return {
    title: section ? `${section.title} — Merlin Dev Docs` : "Merlin Dev Docs",
  };
}

export default async function DevDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const filePath = path.join(DEV_DIR, `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    notFound();
  }

  const content = fs.readFileSync(filePath, "utf-8");

  return (
    <DocsLayout
      sectionTitle="Developer Docs"
      sections={DEV_SECTIONS}
      currentSlug={slug}
      basePath="/dev"
    >
      <MarkdownRenderer content={content} />
    </DocsLayout>
  );
}
