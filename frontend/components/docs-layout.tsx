import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DocsNav } from "@/components/docs-nav";

interface NavSection {
  title: string;
  slug: string;
}

interface DocsLayoutProps {
  children: React.ReactNode;
  sectionTitle: string;
  sections?: NavSection[];
  currentSlug?: string;
  basePath?: string;
}

export function DocsLayout({
  children,
  sectionTitle,
  sections,
  currentSlug,
  basePath,
}: DocsLayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <div className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Merlin
            </Link>
            <span className="text-white/20">|</span>
            <span className="text-sm font-medium text-foreground">
              {sectionTitle}
            </span>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {sections && currentSlug && basePath ? (
          <div className="flex gap-12 py-8">
            {/* Sidebar nav */}
            <aside className="hidden lg:block pt-4">
              <DocsNav
                sections={sections}
                currentSlug={currentSlug}
                basePath={basePath}
              />
            </aside>
            {/* Main content */}
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        ) : (
          <main>{children}</main>
        )}
      </div>
    </div>
  );
}
