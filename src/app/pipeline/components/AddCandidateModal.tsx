import { Button as UiButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { NativeSelect as UiSelect } from "@/components/ui/select";
import { useState, type FormEvent } from "react";
import { Pool } from "../types";

export type AddCandidatePayload = {
  name: string;
  email: string;
  phone?: string;
  country?: string;
  pool_id: string;
};

type AddCandidateModalProps = {
  open: boolean;
  pools: Pool[];
  onClose: () => void;
  onAdd: (payload: AddCandidatePayload) => void;
};

export default function AddCandidateModal({
  open,
  pools,
  onClose,
  onAdd,
}: AddCandidateModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [poolId, setPoolId] = useState(pools[0]?.id ?? "");

  if (!open) return null;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim()) return;
    onAdd({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      country: country.trim() || undefined,
      pool_id: poolId || pools[0]?.id || "",
    });
    setName("");
    setEmail("");
    setPhone("");
    setCountry("");
    setPoolId(pools[0]?.id ?? "");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-panel border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Add Candidates
            </h2>
            <p className="text-xs text-muted-foreground">
              Create a new candidate in the first stage.
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Name</label>
            <UiInput
              className="h-10"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Kateryna Kovalenko"
              required
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Email</label>
            <UiInput
              className="h-10"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@example.com"
              type="email"
              required
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Phone</label>
            <UiInput
              className="h-10"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+370 ..."
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Country</label>
            <UiInput
              className="h-10"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              placeholder="e.g. Portugal"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-muted-foreground">Pool</label>
            <UiSelect
              className="h-10"
              value={poolId}
              onChange={(event) => setPoolId(event.target.value)}
            >
              {pools.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.name}
                </option>
              ))}
            </UiSelect>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <UiButton variant="secondary" size="md"
              type="button"
              className=""
              onClick={onClose}
            >
              Cancel
            </UiButton>
            <UiButton variant="primary" size="md"
              type="submit"
              className=""
            >
              Add candidate
            </UiButton>
          </div>
        </form>
      </div>
    </div>
  );
}
