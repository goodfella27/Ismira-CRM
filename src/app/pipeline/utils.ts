export const formatEmailShort = (email?: string | null) => {
  const trimmed = email?.trim() ?? "";
  if (!trimmed) return "";
  const [local, domain] = trimmed.split("@");
  if (!domain) return trimmed;
  const localShort =
    local.length > 12 ? `${local.slice(0, 7)}…${local.slice(-2)}` : local;
  const domainShort =
    domain.length > 18 ? `${domain.slice(0, 12)}…` : domain;
  return `${localShort}@${domainShort}`;
};

export const formatRelative = (dateString?: string | null) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const formatDateShort = (value?: string | null) => {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const datePart = raw.includes("T") ? raw.split("T")[0] ?? raw : raw;
  const hasDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(datePart);
  const date = hasDateOnly ? new Date(`${datePart}T00:00:00`) : new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};
