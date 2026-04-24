type JobsListPayload = {
  jobs: unknown[];
  priorityTypes: unknown[];
};

type JobsCacheEntry = {
  expiresAt: number;
  payload: JobsListPayload;
};

const jobsResponseCache = new Map<string, JobsCacheEntry>();

export function getJobsResponseCache(key: string) {
  return jobsResponseCache.get(key) ?? null;
}

export function setJobsResponseCache(key: string, entry: JobsCacheEntry) {
  jobsResponseCache.set(key, entry);
}

export function clearJobsResponseCache(key?: string) {
  if (typeof key === "string" && key.trim()) {
    jobsResponseCache.delete(key);
    return;
  }
  jobsResponseCache.clear();
}
