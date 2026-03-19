export type MailerLiteSubscriber = {
  id: string;
  email?: string;
  status?: string;
  name?: string;
  country?: string;
  created_at?: string;
  subscribed_at?: string;
  updated_at?: string;
  sent?: number;
  opens_count?: number;
  clicks_count?: number;
  fields?: Record<string, unknown>;
};

export type CachedLead = {
  subscriber: MailerLiteSubscriber;
  groups: Set<string>;
};

export type CachedSnapshot = {
  data: Array<{
    subscriber: MailerLiteSubscriber;
    groups: string[];
    category: "main" | "needs_improvement";
  }>;
  counts: { main: number; needs_improvement: number; rejected: number };
  cachedAt: string;
};

const GROUP_MAIN = "Ismira Main Collection";
const GROUP_NEEDS_IMPROVEMENT = "NEED IMPROVEMENT";
const GROUP_REJECTED = "APPLICATION NOT APPROVED";

const normalize = (value?: string | null) => (value ?? "").trim().toLowerCase();

const isRelevantGroup = (name?: string | null) => {
  const normalized = normalize(name);
  return (
    normalized === normalize(GROUP_MAIN) ||
    normalized === normalize(GROUP_NEEDS_IMPROVEMENT) ||
    normalized === normalize(GROUP_REJECTED)
  );
};

const resolveCategory = (groups: Set<string>) => {
  if (groups.has(GROUP_REJECTED)) return "rejected";
  if (groups.has(GROUP_MAIN)) return "main";
  if (groups.has(GROUP_NEEDS_IMPROVEMENT)) return "needs_improvement";
  return null;
};

const cache = {
  updatedAt: 0,
  leads: new Map<string, CachedLead>(),
};

export const mailerliteCache = {
  hasData() {
    return cache.leads.size > 0;
  },
  clear() {
    cache.leads.clear();
    cache.updatedAt = Date.now();
  },
  getSnapshot(): CachedSnapshot {
    const data: CachedSnapshot["data"] = [];
    const counts = { main: 0, needs_improvement: 0, rejected: 0 };

    cache.leads.forEach((entry) => {
      const category = resolveCategory(entry.groups);
      if (!category) return;
      if (category === "rejected") {
        counts.rejected += 1;
        return;
      }
      if (category === "main") counts.main += 1;
      if (category === "needs_improvement") counts.needs_improvement += 1;
      data.push({
        subscriber: entry.subscriber,
        groups: Array.from(entry.groups),
        category,
      });
    });

    return {
      data,
      counts,
      cachedAt: new Date(cache.updatedAt || Date.now()).toISOString(),
    };
  },
  updateFromSnapshot(snapshot: {
    data: Array<{ subscriber: MailerLiteSubscriber; groups: string[] }>;
  }) {
    cache.leads.clear();
    snapshot.data.forEach((item) => {
      const id = item.subscriber?.id;
      if (!id) return;
      cache.leads.set(id, {
        subscriber: item.subscriber,
        groups: new Set(item.groups.filter(isRelevantGroup)),
      });
    });
    cache.updatedAt = Date.now();
  },
  upsertSubscriber(subscriber: MailerLiteSubscriber) {
    if (!subscriber?.id) return;
    const existing = cache.leads.get(subscriber.id);
    if (existing) {
      existing.subscriber = { ...existing.subscriber, ...subscriber };
    } else {
      cache.leads.set(subscriber.id, { subscriber, groups: new Set() });
    }
    cache.updatedAt = Date.now();
  },
  addGroup(subscriber: MailerLiteSubscriber, groupName?: string | null) {
    if (!subscriber?.id || !groupName || !isRelevantGroup(groupName)) return;
    const existing =
      cache.leads.get(subscriber.id) ??
      ({ subscriber, groups: new Set() } as CachedLead);
    existing.subscriber = { ...existing.subscriber, ...subscriber };
    existing.groups.add(groupName);
    cache.leads.set(subscriber.id, existing);
    cache.updatedAt = Date.now();
  },
  removeGroup(subscriberId: string, groupName?: string | null) {
    if (!subscriberId || !groupName || !isRelevantGroup(groupName)) return;
    const existing = cache.leads.get(subscriberId);
    if (!existing) return;
    existing.groups.delete(groupName);
    if (existing.groups.size === 0) {
      cache.leads.delete(subscriberId);
    }
    cache.updatedAt = Date.now();
  },
  removeSubscriber(subscriberId: string) {
    if (!subscriberId) return;
    cache.leads.delete(subscriberId);
    cache.updatedAt = Date.now();
  },
};

export const mailerliteGroups = {
  main: GROUP_MAIN,
  needsImprovement: GROUP_NEEDS_IMPROVEMENT,
  rejected: GROUP_REJECTED,
};
