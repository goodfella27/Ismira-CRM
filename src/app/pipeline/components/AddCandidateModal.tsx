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
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Add Candidates
            </h2>
            <p className="text-xs text-slate-500">
              Create a new candidate in the first stage.
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-600">Name</label>
            <input
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Kateryna Kovalenko"
              required
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-600">Email</label>
            <input
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@example.com"
              type="email"
              required
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-600">Phone</label>
            <input
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+370 ..."
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-600">Country</label>
            <input
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              placeholder="e.g. Portugal"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-semibold text-slate-600">Pool</label>
            <select
              className="h-10 rounded-md border border-slate-200 px-3 text-sm"
              value={poolId}
              onChange={(event) => setPoolId(event.target.value)}
            >
              {pools.map((pool) => (
                <option key={pool.id} value={pool.id}>
                  {pool.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              Add candidate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
