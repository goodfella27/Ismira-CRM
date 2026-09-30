# Ismira UI system

The live, admin-only catalog is at `/design-system`. It demonstrates the production primitives with fictional records and includes typography, colors, spacing, buttons, forms, data display, overlays, feedback, and usage guidelines.

This is an original Kobra-inspired design built with the existing React, Radix, Tailwind and shadcn-compatible stack. It does not copy or depend on paid Kobra source code.

## Foundations

The source of truth for theme tokens is `src/app/globals.css`. Fonts are bundled locally through `@fontsource-variable/inter`; there are no Google Fonts requests. Inter supports the form's Latin and Cyrillic languages. Code uses the operating system's monospace font.

| Use | Default |
| --- | --- |
| Metadata / hints | 12px |
| Body / controls | 14px |
| Mobile input text | 16px |
| Section heading | 16px, medium |
| Page heading | 24px, semibold, tight tracking |
| Public hero | 32–40px |
| Spacing | 4, 8, 12, 16, 24, 32, 48px |
| Section padding | 16–24px |
| Desktop workspace gutter | 24–32px |
| Control radius | 6px (`rounded-md`) |
| Panel radius | 10px (`rounded-panel`) |
| Dialog radius | 14px (`rounded-dialog`) |
| Control height | 32px compact, 36px default, 44px large/mobile |
| Desktop sidebar | 240px |
| Motion | 150ms; reduced-motion override |

Use semantic colors, always pairing foreground with its background:

| Purpose | Background | Foreground |
| --- | --- | --- |
| Canvas | `bg-background` | `text-foreground` |
| Panel | `bg-card` | `text-card-foreground` |
| Menu/dialog | `bg-popover` | `text-popover-foreground` |
| Primary action | `bg-primary` | `text-primary-foreground` |
| Supporting area | `bg-muted` | `text-muted-foreground` |
| Selected/hover | `bg-accent` | `text-accent-foreground` |
| Success | `bg-success-muted` | `text-success` |
| Warning | `bg-warning-muted` | `text-warning` |
| Error | `bg-danger-muted` | `text-destructive` |
| Destructive button | `bg-destructive` | `text-destructive-foreground` |

Structural borders use `border-border`; controls use `border-input`. Use `shadow-control` for tactile controls and `shadow-overlay` for floating surfaces. Preserve meaningful opening-type and pipeline colors. Do not replace data-specific color maps with neutral colors.

Light canvas/card: `#fafafa` / `#ffffff`; dark canvas/card: `#191919` / `#202020`. The primary foreground reverses in dark mode. Never put hardcoded white text inside a themed primary surface.

## Theme behavior

`ThemeProvider` and `useTheme()` support `system`, `light`, and `dark`. The preference is stored in `ismira-theme`, with guarded storage reads/writes. The static head script applies the theme before hydration. The provider follows system changes in system mode and synchronizes storage changes across tabs. Portals inherit the root theme.

Use `ThemeToggle` wherever a theme control is appropriate. Do not introduce a second preference or page-specific dark-mode implementation.

## Components

Import components from `@/components/ui/<name>`.

- `Button`: `variant="primary|secondary|ghost|destructive"`, `size="sm|md|lg|icon"`, `pending`, `asChild`, and native button props. Defaults to `type="button"`; set `type="submit"` explicitly inside forms. `pending` disables interaction and exposes `aria-busy`. Give icon-only buttons an accessible name.
- `Input`, `Textarea`, `NativeSelect`, `Checkbox`: preserve native props and refs. Use `Label`, `FieldHint`, `FieldError`, `aria-invalid`, and `aria-describedby` for form state.
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`: Radix select composition. Use `NativeSelect` for an existing native-select contract.
- `Combobox`: `options: {value, label}[]`, `value`, `onValueChange`, `label`, optional `disabled`. Supports search, arrow navigation, Enter selection, and Escape dismissal.
- `Switch`, `RadioGroup`, `RadioGroupItem`: Radix keyboard and state behavior. Label them visibly and programmatically.
- `Badge`, `Alert`: use semantic tone props for status. A color alone must not carry meaning.
- `Avatar`, `Separator`, `Skeleton`, `EmptyState`: supporting presentation primitives.
- `PageHeader`, `Section`, `Toolbar`: common page composition. Use an action slot instead of a second independent title row.
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`: semantic table structure; Table owns horizontal overflow.
- `Pagination`: controlled `page`, `pages`, `onPageChange`.
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`: controlled or uncontrolled Radix tabs.
- `Dialog`, `DialogTrigger`, `DialogContent`, `DialogTitle`, `DialogDescription`, `DialogClose`: modal focus management. Content provides its portal, overlay, and optional close button (`showClose`). Always supply a title. Imperative dialogs without a trigger must restore their captured opener using `onCloseAutoFocus`.
- `DropdownMenu`, `Popover`, `Tooltip`: exported Radix-compatible wrappers provide portal styling. Compose with their Trigger, Content and item exports. Use `TooltipProvider` around tooltip consumers.

```tsx
<Section title="Contact details" description="How we can reach you.">
  <div className="space-y-2">
    <Label htmlFor="email">Email</Label>
    <Input id="email" type="email" required />
  </div>
  <Button type="submit" pending={saving}>Save changes</Button>
</Section>
```

## Migration and maintenance

The previous mint/navy shell, global theme override, ornamental gradients, and duplicated compact-control styles have been replaced at their source. The workspace, HR portal, CRM screens and admin authentication pages consume the shared theme. Public jobs, application, CV and candidate forms retain their original presentation. Public-only components live in `src/components/public`; `public-theme.css` restores their original font, palette and corner sizes, including portaled content. Admin dark-mode preferences do not apply to these routes. Complex drag targets, document editors, photo overlays, charts, and business-specific status controls keep their specialized structure and meaningful colors.

Do not add another blanket stylesheet over these components. Extend a shared variant when multiple screens need it. Keep content widths, form handlers, drag geometry, permissions and API contracts separate from appearance changes.

Menus and dialogs must work with keyboard navigation, Escape, visible focus, and focus return. Stack Radix dialogs with other Radix dialogs; an unlayered body portal on top of a modal can be blocked by pointer/focus trapping.

## Verification record

- 84 Node tests pass, including theme fallback and admin documentation access tests.
- TypeScript passes; changed TypeScript files lint with no errors (existing warnings remain).
- `next build --webpack` passes. Default Turbopack build cannot run with this machine's fallback WASM compiler (`turbo.createProject` unsupported); this is an environment limitation.
- Browser: catalog inspected at 390, 768 and 1440px; light/dark theme; select keyboard interaction; dialog Escape and focus return. Public application form inspected on desktop/mobile; switching English to Lithuanian preserves entered values, and all six languages remain in the menu.
- Independent review found and prompted fixes for stacked public Apply dialogs, imperative-dialog focus restoration, and inverse theme contrast.
- Live candidate screens were not opened: automatic approval review blocked that inspection because it could expose private candidate/CV data. No real application was submitted or MailerLite email triggered. Live-data workflows and drag/drop still need a user-assisted acceptance pass before deployment.
