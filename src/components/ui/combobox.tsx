"use client";
import { useEffect, useId, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
export function Combobox({
  options,
  value,
  onValueChange,
  label,
  disabled,
}: {
  options: { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  const filtered = options.filter((o) =>
    o.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, id, open]);
  const choose = (next: string) => {
    onValueChange(next);
    setOpen(false);
    setQuery("");
    setActive(0);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          disabled={disabled}
          aria-label={label}
          aria-expanded={open}
          className="w-full justify-between"
        >
          <span className="truncate">
            {options.find((o) => o.value === value)?.label || label}
          </span>
          <ChevronsUpDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-60 p-2">
        <Input
          role="combobox"
          aria-label={`Search ${label}`}
          aria-expanded={open}
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={
            filtered[active] ? `${id}-${active}` : undefined
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Search…"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) =>
                Math.max(0, Math.min(i + 1, filtered.length - 1)),
              );
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            }
            if (e.key === "Enter" && filtered[active]) {
              e.preventDefault();
              choose(filtered[active].value);
            }
          }}
        />
        <div
          id={id}
          role="listbox"
          aria-label={label}
          className="mt-2 max-h-60 overflow-auto"
        >
          {filtered.map((o, i) => (
            <div
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o.value)}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${i === active ? "bg-accent" : ""}`}
              onMouseEnter={() => setActive(i)}
            >
              {o.label}
              {o.value === value && <Check size={14} />}
            </div>
          ))}
          {!filtered.length && (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              No results.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
