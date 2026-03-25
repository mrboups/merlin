import Link from "next/link";
import { cn } from "@/lib/utils";

interface NavSection {
  title: string;
  slug: string;
}

interface DocsNavProps {
  sections: NavSection[];
  currentSlug: string;
  basePath: string;
}

export function DocsNav({ sections, currentSlug, basePath }: DocsNavProps) {
  return (
    <nav className="w-56 shrink-0">
      <ul className="space-y-1">
        {sections.map((section) => {
          const isActive = section.slug === currentSlug;
          return (
            <li key={section.slug}>
              <Link
                href={`${basePath}/${section.slug}`}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-[#00d4aa]/10 text-[#00d4aa] font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                )}
              >
                {section.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
