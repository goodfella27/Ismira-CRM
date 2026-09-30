import { Button as UiButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { NativeSelect as UiSelect } from "@/components/ui/select";
import { useMemo, useState, type FormEvent } from "react";

export type CompanyOwner = {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
};

export type AddCompanyPayload = {
  name: string;
  owner_id?: string;
  owner_name?: string;
  website_url?: string;
  phone?: string;
  city?: string;
  country?: string;
  industry?: string;
};

type AddCompanyModalProps = {
  open: boolean;
  owners?: CompanyOwner[];
  defaultOwner?: { id?: string; name?: string } | null;
  onClose: () => void;
  onAdd: (payload: AddCompanyPayload) => void;
};

const normalizeOwners = (owners?: CompanyOwner[]) =>
  (owners ?? [])
    .filter((owner) => !!owner?.id)
    .map((owner) => ({
      id: owner.id,
      name: owner.name ?? "",
      email: owner.email ?? "",
      avatar_url: owner.avatar_url ?? null,
    }))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));

export default function AddCompanyModal({
  open,
  owners,
  defaultOwner,
  onClose,
  onAdd,
}: AddCompanyModalProps) {
  const ownerOptions = useMemo(() => normalizeOwners(owners), [owners]);
  const hasOwnerSelect = ownerOptions.length > 0;
  const preferredOwnerId = !hasOwnerSelect
    ? (defaultOwner?.id ?? "").trim()
    : (
        defaultOwner?.id &&
        ownerOptions.some((owner) => owner.id === defaultOwner.id)
          ? defaultOwner.id
          : ownerOptions[0]?.id
      )?.trim() ?? "";

  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [industry, setIndustry] = useState("");

  if (!open) return null;

  const resolvedOwnerId = hasOwnerSelect
    ? (ownerId || preferredOwnerId)
    : ownerId || (defaultOwner?.id ?? "");
  const resolvedOwner =
    hasOwnerSelect && resolvedOwnerId
      ? ownerOptions.find((owner) => owner.id === resolvedOwnerId) ?? null
      : null;

  const handleClose = () => {
    setName("");
    setWebsiteUrl("");
    setPhone("");
    setCity("");
    setCountry("");
    setIndustry("");
    setOwnerId("");
    setOwnerName("");
    onClose();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const selectedOwner = resolvedOwner;

    onAdd({
      name: trimmedName,
      owner_id: (selectedOwner?.id ?? resolvedOwnerId)?.trim() || undefined,
      owner_name:
        (selectedOwner?.name ?? ownerName ?? defaultOwner?.name)?.trim() ||
        (selectedOwner?.email ?? "")?.trim() ||
        undefined,
      website_url: websiteUrl.trim() || undefined,
      phone: phone.trim() || undefined,
      city: city.trim() || undefined,
      country: country.trim() || undefined,
      industry: industry.trim() || undefined,
    });

    setName("");
    setWebsiteUrl("");
    setPhone("");
    setCity("");
    setCountry("");
    setIndustry("");
    setOwnerId("");
    setOwnerName("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded-panel border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Add Company</h2>
            <p className="text-xs text-muted-foreground">
              Create a new company record.
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={handleClose}
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Company name
            </label>
            <UiInput
              className="h-10"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Tech Edge College"
              required
            />
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Company owner
            </label>
            {hasOwnerSelect ? (
              <UiSelect
                className="h-10"
                value={resolvedOwnerId}
                onChange={(event) => {
                  const next = event.target.value;
                  setOwnerId(next);
                }}
              >
                {ownerOptions.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name || owner.email}
                  </option>
                ))}
              </UiSelect>
            ) : (
              <UiInput
                className="h-10"
                value={ownerName || defaultOwner?.name || ""}
                onChange={(event) => setOwnerName(event.target.value)}
                placeholder="e.g. Arturas Zakarauskas"
              />
            )}
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Phone number
              </label>
              <UiInput
                className="h-10"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+1 ..."
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold text-muted-foreground">
                City
              </label>
              <UiInput
                className="h-10"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="e.g. Sydney"
              />
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Country/Region
              </label>
              <UiInput
                className="h-10"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                placeholder="e.g. Australia"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Industry
              </label>
              <UiInput
                className="h-10"
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                placeholder="e.g. Education"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Website (optional)
            </label>
            <UiInput
              className="h-10"
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              placeholder="https://company.com"
              type="text"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <UiButton variant="secondary" size="md"
              type="button"
              className=""
              onClick={handleClose}
            >
              Cancel
            </UiButton>
            <UiButton variant="primary" size="md"
              type="submit"
              className=""
            >
              Add company
            </UiButton>
          </div>
        </form>
      </div>
    </div>
  );
}
