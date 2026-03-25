import type { FC } from "react";

interface Props {
  content: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function convertInlineMarkdown(text: string): string {
  // Bold **text**
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic *text* (not **)
  text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  // Inline code `code`
  text = text.replace(
    /`([^`]+)`/g,
    `<code class="bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>`
  );
  // Links [text](url)
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, linkText, url) => {
      // Convert relative .md links to route paths
      const resolvedUrl = url.replace(/\.md$/, "").replace(/^\.\//, "");
      const isExternal =
        resolvedUrl.startsWith("http://") || resolvedUrl.startsWith("https://");
      const attrs = isExternal
        ? ' target="_blank" rel="noopener noreferrer"'
        : "";
      return `<a href="${resolvedUrl}" class="text-[#00d4aa] hover:underline"${attrs}>${linkText}</a>`;
    }
  );
  return text;
}

function convertMarkdown(raw: string): string {
  const lines = raw.split("\n");
  const output: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeLines: string[] = [];
  let inTable = false;
  let tableHasHeader = false;
  let inOrderedList = false;
  let inUnorderedList = false;
  let inBlockquote = false;

  function closeOpenBlocks() {
    if (inUnorderedList) {
      output.push("</ul>");
      inUnorderedList = false;
    }
    if (inOrderedList) {
      output.push("</ol>");
      inOrderedList = false;
    }
    if (inBlockquote) {
      output.push("</blockquote>");
      inBlockquote = false;
    }
    if (inTable) {
      output.push("</tbody></table></div>");
      inTable = false;
      tableHasHeader = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block fence
    if (line.trimStart().startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        const escaped = codeLines.map(escapeHtml).join("\n");
        output.push(
          `<pre class="bg-[#0d0d1a] p-4 rounded-lg overflow-x-auto mb-6 text-sm font-mono text-gray-300">${escaped}</pre>`
        );
        inCodeBlock = false;
        codeBlockLang = "";
        codeLines = [];
      } else {
        closeOpenBlocks();
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Horizontal rule --- or *** or ___
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      closeOpenBlocks();
      output.push(`<hr class="border-white/10 my-8" />`);
      continue;
    }

    // Headings
    const h4 = line.match(/^####\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);

    if (h4) {
      closeOpenBlocks();
      output.push(
        `<h4 class="text-lg font-semibold mt-6 mb-2 text-white">${convertInlineMarkdown(h4[1])}</h4>`
      );
      continue;
    }
    if (h3) {
      closeOpenBlocks();
      output.push(
        `<h3 class="text-xl font-semibold mt-8 mb-3 text-white">${convertInlineMarkdown(h3[1])}</h3>`
      );
      continue;
    }
    if (h2) {
      closeOpenBlocks();
      output.push(
        `<h2 class="text-2xl font-semibold mt-10 mb-4 text-white">${convertInlineMarkdown(h2[1])}</h2>`
      );
      continue;
    }
    if (h1) {
      closeOpenBlocks();
      output.push(
        `<h1 class="text-4xl font-bold mb-6 text-white">${convertInlineMarkdown(h1[1])}</h1>`
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      if (!inBlockquote) {
        closeOpenBlocks();
        output.push(
          `<blockquote class="border-l-4 border-[#00d4aa] pl-4 italic text-gray-400 mb-4">`
        );
        inBlockquote = true;
      }
      output.push(`<p class="mb-1">${convertInlineMarkdown(line.slice(2))}</p>`);
      continue;
    } else if (inBlockquote) {
      output.push("</blockquote>");
      inBlockquote = false;
    }

    // Table row
    if (line.includes("|") && line.trim().startsWith("|")) {
      // Separator row (e.g., |---|---|)
      if (/^\|[\s\-:|]+\|/.test(line.trim())) {
        if (inTable && !tableHasHeader) {
          tableHasHeader = true;
        }
        continue;
      }

      const cells = line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((c) => c.trim());

      if (!inTable) {
        closeOpenBlocks();
        output.push(
          `<div class="overflow-x-auto mb-6"><table class="w-full border-collapse">`
        );
        inTable = true;
        tableHasHeader = false;
        // First row is header
        output.push("<thead><tr>");
        cells.forEach((cell) => {
          output.push(
            `<th class="border border-white/10 bg-white/5 px-4 py-2 text-left text-sm font-semibold text-white">${convertInlineMarkdown(cell)}</th>`
          );
        });
        output.push("</tr></thead><tbody>");
      } else {
        output.push("<tr>");
        cells.forEach((cell) => {
          output.push(
            `<td class="border border-white/10 px-4 py-2 text-sm text-gray-300">${convertInlineMarkdown(cell)}</td>`
          );
        });
        output.push("</tr>");
      }
      continue;
    } else if (inTable) {
      output.push("</tbody></table></div>");
      inTable = false;
      tableHasHeader = false;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)-\s+(.+)/);
    if (ulMatch) {
      if (!inUnorderedList) {
        if (inOrderedList) {
          output.push("</ol>");
          inOrderedList = false;
        }
        output.push(`<ul class="list-disc mb-4 space-y-1">`);
        inUnorderedList = true;
      }
      output.push(
        `<li class="text-gray-300 ml-6 mb-1">${convertInlineMarkdown(ulMatch[2])}</li>`
      );
      continue;
    } else if (inUnorderedList && line.trim() !== "") {
      // non-list content — close the list
      output.push("</ul>");
      inUnorderedList = false;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      if (!inOrderedList) {
        if (inUnorderedList) {
          output.push("</ul>");
          inUnorderedList = false;
        }
        output.push(`<ol class="list-decimal mb-4 space-y-1">`);
        inOrderedList = true;
      }
      output.push(
        `<li class="text-gray-300 ml-6 mb-1">${convertInlineMarkdown(olMatch[1])}</li>`
      );
      continue;
    } else if (inOrderedList && line.trim() !== "") {
      output.push("</ol>");
      inOrderedList = false;
    }

    // Empty line — close lists / blockquotes
    if (line.trim() === "") {
      if (inUnorderedList) {
        output.push("</ul>");
        inUnorderedList = false;
      }
      if (inOrderedList) {
        output.push("</ol>");
        inOrderedList = false;
      }
      if (inBlockquote) {
        output.push("</blockquote>");
        inBlockquote = false;
      }
      continue;
    }

    // Regular paragraph
    output.push(
      `<p class="text-gray-300 leading-relaxed mb-4">${convertInlineMarkdown(line)}</p>`
    );
  }

  closeOpenBlocks();

  // Close any unclosed code block
  if (inCodeBlock) {
    const escaped = codeLines.map(escapeHtml).join("\n");
    output.push(
      `<pre class="bg-[#0d0d1a] p-4 rounded-lg overflow-x-auto mb-6 text-sm font-mono text-gray-300">${escaped}</pre>`
    );
  }

  return output.join("\n");
}

export const MarkdownRenderer: FC<Props> = ({ content }) => {
  const html = convertMarkdown(content);
  return (
    <div
      className="max-w-4xl mx-auto px-6 py-12"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
