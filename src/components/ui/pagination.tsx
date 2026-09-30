import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
export function Pagination({
  page,
  pages,
  onPageChange,
  disabled,
}: {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 py-4"
    >
      <p className="text-xs text-muted-foreground">
        Page {page} of {Math.max(1, pages)}
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
