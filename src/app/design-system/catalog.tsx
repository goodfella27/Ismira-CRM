"use client";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  Plus,
  Search,
  SlidersHorizontal,
  Inbox,
  Copy,
  Mail,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label, FieldHint, FieldError } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
const sections = [
  "Overview",
  "Typography",
  "Colors",
  "Spacing",
  "Buttons",
  "Forms",
  "Data display",
  "Overlays",
  "Feedback",
  "Guidelines",
];
function idFor(label: string) {
  return label.toLowerCase().replaceAll(" ", "-");
}
function Example({
  title,
  description,
  children,
  code,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  code?: string;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-base font-medium">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="rounded-panel border border-border bg-card p-5 sm:p-8">
        {children}
      </div>
      {code && (
        <pre className="mt-2 overflow-x-auto rounded-md bg-muted px-4 py-3 font-mono text-xs leading-5 text-muted-foreground">
          <code>{code}</code>
        </pre>
      )}
    </section>
  );
}
export default function Catalog() {
  const [active, setActive] = useState("Overview");
  const [checked, setChecked] = useState(true);
  const [country, setCountry] = useState("LT");
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState("");
  return (
    <TooltipProvider delayDuration={250}>
      <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          title="Design system"
          description="The foundations and components of Ismira. One shared visual language, across every workflow."
          actions={
            <>
              <Badge>Version 1.0</Badge>
              <ThemeToggle />
            </>
          }
        />
        <div className="flex flex-col gap-8 lg:flex-row">
          <nav
            aria-label="Design system sections"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-border pb-3 lg:sticky lg:top-6 lg:h-fit lg:w-44 lg:flex-col lg:overflow-visible lg:border-0 lg:pb-0"
          >
            {sections.map((label, index) => (
              <button
                key={label}
                onClick={() => {
                  setActive(label);
                  setNotice("");
                }}
                aria-current={active === label ? "page" : undefined}
                className={`flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors ${active === label ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                <span className="font-mono text-[10px] opacity-60">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {label}
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1" id={idFor(active)}>
            {active === "Overview" && (
              <>
                <div className="mb-8 flex items-center justify-between border-b border-border pb-5">
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">
                      FOUNDATIONS / COMPONENTS
                    </p>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Made for the work.
                    </h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                      Neutral surfaces, clear hierarchy, and familiar
                      interactions. These are live components, built from the
                      same primitives used in the platform.
                    </p>
                  </div>
                  <span className="hidden rounded-panel border border-border p-4 text-muted-foreground sm:block">
                    <SlidersHorizontal size={24} />
                  </span>
                </div>
                <Example
                  title="A working surface"
                  description="Fictional records demonstrate layout and interaction. No candidate data is used."
                >
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium">Application review</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        All applications in one place.
                      </p>
                    </div>
                    <Button
                      onClick={() =>
                        setNotice(
                          "This is a component demonstration. No application was created.",
                        )
                      }
                    >
                      <Plus />
                      Add application
                    </Button>
                  </div>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <div className="relative min-w-48 flex-1">
                      <Search className="absolute left-3 top-3 size-4 text-muted-foreground sm:top-2.5" />
                      <Input
                        placeholder="Search applications…"
                        aria-label="Search example applications"
                        className="pl-9"
                      />
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => setActive("Forms")}
                    >
                      <SlidersHorizontal />
                      Filters
                    </Button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Language</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        ["Alex Morgan", "Hospitality", "Ready", "B2"],
                        ["Sam Taylor", "Guest services", "In review", "C1"],
                        ["Jamie Lee", "Culinary", "New", "B1"],
                      ].map(([name, department, status, language], i) => (
                        <TableRow key={name}>
                          <TableCell>
                            <span className="flex items-center gap-3">
                              <Avatar>
                                {name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")}
                              </Avatar>
                              <span>
                                <span className="block font-medium">
                                  {name}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  Example record
                                </span>
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {department}
                          </TableCell>
                          <TableCell>
                            <Badge
                              tone={
                                i === 0
                                  ? "success"
                                  : i === 1
                                    ? "warning"
                                    : "neutral"
                              }
                            >
                              {status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {language}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination page={page} pages={3} onPageChange={setPage} />
                  {notice && <Alert>{notice}</Alert>}
                </Example>
                <div className="grid gap-6 sm:grid-cols-3">
                  {[
                    ["Type", "Inter", "14px body · 24px headings"],
                    ["Space", "4px grid", "Consistent rhythm and alignment"],
                    ["Color", "Semantic", "Light and dark, by preference"],
                  ].map(([label, value, note]) => (
                    <button
                      key={label}
                      onClick={() =>
                        setActive(
                          label === "Type"
                            ? "Typography"
                            : label === "Space"
                              ? "Spacing"
                              : "Colors",
                        )
                      }
                      className="border-t border-border pt-4 text-left"
                    >
                      <span className="text-xs text-muted-foreground">
                        {label}
                      </span>
                      <span className="mt-2 block text-lg font-medium">
                        {value}
                        <ArrowUpRight className="float-right size-4 text-muted-foreground" />
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {note}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {active === "Typography" && (
              <Example
                title="Inter, with purpose"
                description="Bundled locally with Latin, extended Latin, and Cyrillic characters."
              >
                {[
                  [
                    "Page heading",
                    "text-2xl font-semibold tracking-tight",
                    "24 / 600",
                  ],
                  ["Section heading", "text-base font-medium", "16 / 500"],
                  ["Body text for everyday work", "text-sm", "14 / 400"],
                  [
                    "Metadata and supporting information",
                    "text-xs text-muted-foreground",
                    "12 / 400",
                  ],
                ].map(([label, cls, size]) => (
                  <div
                    key={label}
                    className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-5 last:border-0"
                  >
                    <p className={cls}>{label}</p>
                    <code className="text-xs text-muted-foreground">
                      {size}
                    </code>
                  </div>
                ))}
                <p className="mt-6 text-sm leading-7">
                  Lietuvių · Polski · Українська · Deutsch · Русский
                  <br />Ą Č Ę Ė Į Š Ų Ū Ž · Ł Ó Ż · Ї Є Ґ · Ä Ö Ü ß
                </p>
              </Example>
            )}
            {active === "Colors" && (
              <Example
                title="Semantic colors"
                description="Use a token's purpose instead of a literal color. Switch themes to see the same roles adapt."
              >
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                  {[
                    "background",
                    "foreground",
                    "card",
                    "muted",
                    "muted-foreground",
                    "primary",
                    "secondary",
                    "border",
                    "input",
                    "success",
                    "warning",
                    "destructive",
                  ].map((token) => (
                    <div key={token}>
                      <div
                        className="h-20 rounded-md border border-border"
                        style={{ background: `var(--${token})` }}
                      />
                      <code className="mt-2 block text-xs">{token}</code>
                    </div>
                  ))}
                </div>
              </Example>
            )}
            {active === "Spacing" && (
              <>
                <Example
                  title="A 4px rhythm"
                  description="Use the same scale for gaps, margins, and padding."
                >
                  <div className="space-y-4">
                    {[4, 8, 12, 16, 24, 32, 48].map((space) => (
                      <div key={space} className="flex items-center gap-5">
                        <code className="w-12 text-xs text-muted-foreground">
                          {space}px
                        </code>
                        <div
                          className="h-5 rounded bg-primary"
                          style={{ width: space * 4 }}
                        />
                        <span className="text-xs text-muted-foreground">
                          {space / 4} units
                        </span>
                      </div>
                    ))}
                  </div>
                </Example>
                <Example title="Corners and controls">
                  <div className="flex flex-wrap items-end gap-8">
                    {[
                      ["Control", 6],
                      ["Panel", 10],
                      ["Dialog", 14],
                    ].map(([label, radius]) => (
                      <div
                        key={label}
                        className="flex size-28 items-center justify-center border border-input bg-muted text-xs"
                        style={{ borderRadius: radius }}
                      >
                        {label} · {radius}px
                      </div>
                    ))}
                  </div>
                </Example>
              </>
            )}
            {active === "Buttons" && (
              <>
                <Example
                  title="Actions"
                  description="One primary action per working area. Secondary for alternatives; ghost for quieter controls."
                  code={
                    '<Button>Save changes</Button>\n<Button variant="secondary">Cancel</Button>'
                  }
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={() => setNotice("Example saved.")}>
                      <Check />
                      Save changes
                    </Button>
                    <Button variant="secondary">Cancel</Button>
                    <Button variant="ghost">
                      View details
                      <ArrowUpRight />
                    </Button>
                    <Button variant="destructive">Delete</Button>
                  </div>
                  {notice && (
                    <p role="status" className="mt-4 text-xs text-success">
                      {notice}
                    </p>
                  )}
                </Example>
                <Example title="Sizes and states">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="sm">Compact</Button>
                    <Button>Default</Button>
                    <Button size="lg">Large</Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label="Add item"
                    >
                      <Plus />
                    </Button>
                    <Button disabled>Unavailable</Button>
                    <Button pending>Saving</Button>
                  </div>
                </Example>
              </>
            )}
            {active === "Forms" && (
              <Example
                title="Form controls"
                description="Every field has a visible label. Errors explain what needs attention."
                code={'<Label htmlFor="name">Name</Label>\n<Input id="name" />'}
              >
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="example-name">Full name</Label>
                    <Input id="example-name" placeholder="Alex Morgan" />
                    <FieldHint>
                      Enter the name shown on your documents.
                    </FieldHint>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="example-email">Email</Label>
                    <Input
                      id="example-email"
                      defaultValue="alex@"
                      aria-invalid="true"
                      aria-describedby="email-error"
                    />
                    <FieldError id="email-error">
                      Enter a complete email address.
                    </FieldError>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="example-department">Department</Label>
                    <Select defaultValue="hospitality">
                      <SelectTrigger id="example-department">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hospitality">Hospitality</SelectItem>
                        <SelectItem value="culinary">Culinary</SelectItem>
                        <SelectItem value="guest">Guest services</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Combobox
                      label="Country"
                      value={country}
                      onValueChange={setCountry}
                      options={[
                        { value: "LT", label: "Lithuania" },
                        { value: "PL", label: "Poland" },
                        { value: "UA", label: "Ukraine" },
                        { value: "DE", label: "Germany" },
                        { value: "GB", label: "United Kingdom" },
                      ]}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="example-note">Notes</Label>
                    <Textarea id="example-note" placeholder="Add a note…" />
                  </div>
                  <label className="flex items-center gap-3">
                    <Checkbox defaultChecked />
                    Receive updates
                  </label>
                  <label className="flex items-center gap-3">
                    <Switch checked={checked} onCheckedChange={setChecked} />
                    Enable notifications
                  </label>
                  <RadioGroup
                    defaultValue="email"
                    aria-label="Contact preference"
                  >
                    <label className="flex items-center gap-3">
                      <RadioGroupItem value="email" />
                      Email
                    </label>
                    <label className="flex items-center gap-3">
                      <RadioGroupItem value="phone" />
                      Phone
                    </label>
                  </RadioGroup>
                  <div className="space-y-2">
                    <Label htmlFor="disabled-field">Read-only example</Label>
                    <Input
                      id="disabled-field"
                      disabled
                      value="Managed by your team"
                    />
                  </div>
                </div>
              </Example>
            )}
            {active === "Data display" && (
              <>
                <Example title="Status and identity">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar>AM</Avatar>
                    <Badge>New</Badge>
                    <Badge tone="success">Ready</Badge>
                    <Badge tone="warning">In review</Badge>
                    <Badge tone="danger">Needs attention</Badge>
                  </div>
                </Example>
                <Example title="Tabs and pagination">
                  <Tabs defaultValue="all">
                    <TabsList>
                      <TabsTrigger value="all">All records</TabsTrigger>
                      <TabsTrigger value="saved">Saved</TabsTrigger>
                    </TabsList>
                    <TabsContent value="all">
                      <p className="py-4 text-sm text-muted-foreground">
                        All example records.
                      </p>
                    </TabsContent>
                    <TabsContent value="saved">
                      <p className="py-4 text-sm text-muted-foreground">
                        Your saved example records.
                      </p>
                    </TabsContent>
                  </Tabs>
                  <Pagination page={page} pages={3} onPageChange={setPage} />
                </Example>
              </>
            )}
            {active === "Overlays" && (
              <Example
                title="Focused interactions"
                description="Keyboard accessible, themed through portals, and dismissible with Escape."
              >
                <div className="flex flex-wrap gap-3">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="secondary">Open dialog</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogTitle className="text-lg font-semibold">
                        Update application
                      </DialogTitle>
                      <DialogDescription className="mt-2 text-sm leading-6 text-muted-foreground">
                        This is an interactive example. No real record will be
                        changed.
                      </DialogDescription>
                      <div className="my-5 space-y-2">
                        <Label htmlFor="dialog-note">Note</Label>
                        <Textarea
                          id="dialog-note"
                          placeholder="Write a note…"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <DialogClose asChild>
                          <Button variant="secondary">Cancel</Button>
                        </DialogClose>
                        <DialogClose asChild>
                          <Button>Save note</Button>
                        </DialogClose>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="secondary">
                        Actions
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onSelect={() =>
                          setNotice("Example link copied action selected.")
                        }
                      >
                        <Copy />
                        Copy link
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          setNotice(
                            "Example email action selected. No email sent.",
                          )
                        }
                      >
                        <Mail />
                        Send email
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="secondary">Open popover</Button>
                    </PopoverTrigger>
                    <PopoverContent>
                      <p className="font-medium">Quick context</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        Small contextual information without leaving your
                        current work.
                      </p>
                    </PopoverContent>
                  </Popover>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="More information"
                      >
                        <Inbox />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Supporting information appears here.
                    </TooltipContent>
                  </Tooltip>
                </div>
                {notice && (
                  <p
                    role="status"
                    className="mt-4 text-xs text-muted-foreground"
                  >
                    {notice}
                  </p>
                )}
              </Example>
            )}
            {active === "Feedback" && (
              <>
                <Example title="Useful feedback">
                  <div className="space-y-3">
                    <Alert tone="success">Changes saved successfully.</Alert>
                    <Alert tone="warning">
                      Check the highlighted fields before continuing.
                    </Alert>
                    <Alert tone="danger">
                      Unable to load records. Please try again.
                    </Alert>
                  </div>
                </Example>
                <Example title="Loading">
                  <div className="flex items-center gap-4">
                    <Skeleton className="size-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                </Example>
                <Example title="An empty working area">
                  <EmptyState
                    icon={<Inbox size={28} />}
                    title="Nothing here yet"
                    description="Records will appear here when they become available."
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => setActive("Overview")}
                      >
                        Back to examples
                      </Button>
                    }
                  />
                </Example>
              </>
            )}
            {active === "Guidelines" && (
              <Example title="Building with this system">
                <div className="space-y-5 text-sm leading-6">
                  {[
                    [
                      "Use semantic tokens",
                      "Choose bg-card, text-muted-foreground, and border-border. Keep business status colors meaningful.",
                    ],
                    [
                      "Build from shared primitives",
                      "Import from @/components/ui. Use Button variants instead of local button class strings.",
                    ],
                    [
                      "Keep spacing predictable",
                      "Use 16–24px inside sections, 24–32px between sections, and 36px default desktop controls.",
                    ],
                    [
                      "Make interaction accessible",
                      "Give every input a label, every icon button an accessible name, and preserve a visible focus ring.",
                    ],
                    [
                      "Design for real content",
                      "Allow long names and translations to wrap. Scroll wide tables inside their container.",
                    ],
                    [
                      "Respect preferences",
                      "Use system, light, and dark themes; honor reduced motion. Never hardcode an overlay to white.",
                    ],
                  ].map(([title, description]) => (
                    <div key={title}>
                      <h3 className="font-medium">{title}</h3>
                      <p className="mt-1 text-muted-foreground">
                        {description}
                      </p>
                    </div>
                  ))}
                </div>
              </Example>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
