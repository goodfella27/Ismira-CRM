"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError || !data?.user) {
          router.push("/login");
          return;
        }
        if (ignore) return;
        const metadata = data.user.user_metadata as Record<string, unknown> | null;
        setEmail(data.user.email ?? "");
        setFirstName(String(metadata?.first_name ?? ""));
        setLastName(String(metadata?.last_name ?? ""));
        const path = typeof metadata?.avatar_path === "string" ? metadata.avatar_path : null;
        setAvatarPath(path);
        if (path) {
          const res = await fetch(
            `/api/storage/sign?bucket=candidate-documents&path=${encodeURIComponent(
              path
            )}`,
            { cache: "no-store" }
          );
          const data = await res.json().catch(() => null);
          if (res.ok && data?.url) {
            setAvatarUrl(data.url);
          }
        }
      } catch (err) {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : "Unable to load profile."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [router, supabase]);

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const fullName = `${firstName} ${lastName}`.trim();
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: fullName || undefined,
        },
      });
      if (updateError) {
        throw updateError;
      }
      setMessage("Profile updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File | null) => {
    if (!file) return;
    setAvatarUploading(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Upload failed");
      }
      const path = data?.path as string | undefined;
      if (path) {
        setAvatarPath(path);
        const signRes = await fetch(
          `/api/storage/sign?bucket=candidate-documents&path=${encodeURIComponent(
            path
          )}`,
          { cache: "no-store" }
        );
        const signData = await signRes.json().catch(() => null);
        if (signRes.ok && signData?.url) {
          setAvatarUrl(signData.url);
        }
      }
      setMessage("Profile photo updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 px-8 py-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-600">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Profile"
                className="h-full w-full object-cover"
              />
            ) : (
              `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "U"
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-500">Profile</div>
            <div className="text-2xl font-semibold text-slate-900">
              Account details
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center px-6 py-10">
        <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          {loading ? (
            <div className="text-sm text-slate-500">Loading profile…</div>
          ) : (
            <form className="space-y-6" onSubmit={handleSave}>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-600">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt="Profile"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() ||
                    "U"
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase text-slate-500">
                    Profile photo
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    {avatarUploading ? "Uploading..." : "Upload photo"}
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        void handleAvatarUpload(file);
                        event.currentTarget.value = "";
                      }}
                      disabled={avatarUploading}
                    />
                  </label>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    className="text-xs font-semibold uppercase text-slate-500"
                    htmlFor="profile_first_name"
                  >
                    First name
                  </label>
                  <input
                    id="profile_first_name"
                    type="text"
                    autoComplete="given-name"
                    required
                    className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm outline-none"
                    placeholder="First name"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label
                    className="text-xs font-semibold uppercase text-slate-500"
                    htmlFor="profile_last_name"
                  >
                    Last name
                  </label>
                  <input
                    id="profile_last_name"
                    type="text"
                    autoComplete="family-name"
                    required
                    className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm outline-none"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-slate-500">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full cursor-not-allowed rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-500 outline-none"
                />
              </div>

              {error ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                  {error}
                </div>
              ) : null}
              {message ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {message}
                </div>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
