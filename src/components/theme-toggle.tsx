"use client";
import { Moon, Sun, Monitor, Check } from "lucide-react";
import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const Icon =
    preference === "light" ? Sun : preference === "dark" ? Moon : Monitor;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Choose color theme">
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(
          [
            { value: "system", label: "System", icon: Monitor },
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
          ] as const
        ).map((item) => (
          <DropdownMenuItem
            key={item.value}
            onSelect={() => setPreference(item.value)}
          >
            <item.icon />
            {item.label}
            {preference === item.value && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
