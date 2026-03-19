"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownProps = {
  content: string;
  className?: string;
};

export default function Markdown({ content, className }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h3: ({ children, ...props }) => (
            <h3 className="mt-3 text-sm font-semibold text-foreground" {...props}>
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4 className="mt-3 text-sm font-semibold text-foreground" {...props}>
              {children}
            </h4>
          ),
          p: ({ children, ...props }) => (
            <p className="mt-2 text-sm text-foreground" {...props}>
              {children}
            </p>
          ),
          ul: ({ children, ...props }) => (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-foreground" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="text-sm text-foreground" {...props}>
              {children}
            </li>
          ),
          table: ({ children, ...props }) => (
            <table className="mt-2 w-full border border-border text-xs" {...props}>
              {children}
            </table>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-muted/40" {...props}>
              {children}
            </thead>
          ),
          th: ({ children, ...props }) => (
            <th className="border border-border px-2 py-1 text-left text-xs font-semibold" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="border border-border px-2 py-1 align-top text-xs" {...props}>
              {children}
            </td>
          ),
          strong: ({ children, ...props }) => (
            <strong className="font-semibold" {...props}>
              {children}
            </strong>
          ),
          code: ({ children, ...props }) => (
            <code className="rounded bg-muted px-1 py-0.5 text-xs" {...props}>
              {children}
            </code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
