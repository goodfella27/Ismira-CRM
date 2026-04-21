type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function humanizeBreezyEventToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const override: Record<string, string> = {
    candidateStatusUpdated: "Status updated",
    candidateDocumentAdded: "Document added",
    candidateInterviewAdded: "Interview scheduled",
    candidateInterviewCancel: "Interview canceled",
    candidateInterviewCancelled: "Interview canceled",
    companyNotePosted: "Note added",
  };
  if (override[trimmed]) return override[trimmed]!;

  const normalized = trimmed.replace(/[_-]+/g, " ");
  const spaced = normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
  if (!spaced) return "";
  const words = spaced.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const sentence = words
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx === 0) return lower.charAt(0).toUpperCase() + lower.slice(1);
      return lower;
    })
    .join(" ");
  return sentence;
}

function extractStreamBody(item: UnknownRecord): string {
  const data = isRecord(item.data) ? (item.data as UnknownRecord) : null;
  const payload = isRecord(item.payload) ? (item.payload as UnknownRecord) : null;
  const meta = isRecord(item.meta) ? (item.meta as UnknownRecord) : null;
  const note = isRecord(item.note) ? (item.note as UnknownRecord) : null;
  const comment = isRecord(item.comment) ? (item.comment as UnknownRecord) : null;
  const dataNote = data && isRecord(data.note) ? (data.note as UnknownRecord) : null;
  const payloadNote =
    payload && isRecord(payload.note) ? (payload.note as UnknownRecord) : null;

  return pickFirstString(
    item.body,
    item.text,
    item.message,
    item.content,
    item.note,
    item.description,
    note?.body,
    note?.text,
    note?.message,
    note?.content,
    note?.note,
    comment?.body,
    comment?.text,
    comment?.message,
    comment?.content,
    data?.body,
    data?.text,
    data?.message,
    data?.content,
    data?.note,
    data?.description,
    dataNote?.body,
    dataNote?.text,
    dataNote?.message,
    dataNote?.content,
    payload?.body,
    payload?.text,
    payload?.message,
    payload?.content,
    payload?.note,
    payload?.description,
    payloadNote?.body,
    payloadNote?.text,
    payloadNote?.message,
    payloadNote?.content,
    meta?.body,
    meta?.text,
    meta?.message,
    meta?.content,
    meta?.note,
    meta?.description
  );
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function parseMonthName(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const short = trimmed.slice(0, 3);
  const idx = MONTHS.findIndex((m) => m.toLowerCase() === short);
  return idx >= 0 ? idx + 1 : null;
}

function formatMonthYear(month: number | null, year: number | null) {
  if (!year || !Number.isFinite(year)) return "";
  if (!month || !Number.isFinite(month)) return String(year);
  const m = Math.max(1, Math.min(12, Math.trunc(month)));
  return `${MONTHS[m - 1]} ${Math.trunc(year)}`;
}

function extractMonthYearLabel(value: unknown, depth = 0): string {
  if (depth > 4) return "";
  if (!value) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/present|current|now/i.test(trimmed)) return "Present";

    const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      return formatMonthYear(month, year);
    }

    const named = trimmed.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
    if (named) {
      const month = parseMonthName(named[1]);
      const year = Number(named[2]);
      return formatMonthYear(month, year) || trimmed;
    }
    const reverse = trimmed.match(/^(\d{4})\s+([A-Za-z]{3,9})$/);
    if (reverse) {
      const year = Number(reverse[1]);
      const month = parseMonthName(reverse[2]);
      return formatMonthYear(month, year) || trimmed;
    }

    if (/^\d{4}$/.test(trimmed)) return trimmed;
    return trimmed;
  }

  if (typeof value === "number") {
    if (Number.isFinite(value) && value >= 1900 && value <= 2200) {
      return String(Math.trunc(value));
    }
    return "";
  }

  if (!isRecord(value)) return "";
  const obj = value as UnknownRecord;

  const yearRaw = obj.year ?? obj.y ?? obj.Y;
  const monthRaw = obj.month ?? obj.m ?? obj.M;
  const monthNameRaw = obj.month_name ?? obj.monthName ?? obj.month_label ?? obj.monthLabel;

  const year =
    typeof yearRaw === "number"
      ? yearRaw
      : typeof yearRaw === "string"
      ? Number(yearRaw)
      : null;
  let month: number | null =
    typeof monthRaw === "number"
      ? monthRaw
      : typeof monthRaw === "string"
      ? Number(monthRaw)
      : null;
  if ((!month || !Number.isFinite(month)) && typeof monthNameRaw === "string") {
    month = parseMonthName(monthNameRaw);
  }

  const direct = formatMonthYear(
    month && Number.isFinite(month) ? month : null,
    year && Number.isFinite(year) ? year : null
  );
  if (direct) return direct;

  for (const key of ["date", "value", "start", "end", "from", "to"]) {
    if (!(key in obj)) continue;
    const found = extractMonthYearLabel(obj[key], depth + 1);
    if (found) return found;
  }

  return "";
}

function isTruthy(value: unknown) {
  if (value === true) return true;
  if (typeof value === "string") return ["true", "yes", "1"].includes(value.trim().toLowerCase());
  if (typeof value === "number") return value === 1;
  return false;
}

function extractArray(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) {
    return value.filter((item) => isRecord(item)) as UnknownRecord[];
  }
  if (isRecord(value)) {
    for (const key of ["data", "results", "items", "events", "stream"]) {
      const nested = value[key];
      if (Array.isArray(nested)) {
        return nested.filter((item) => isRecord(item)) as UnknownRecord[];
      }
    }
  }
  return [];
}

export function normalizeBreezyTags(value: unknown): string[] {
  const tags = Array.isArray(value) ? value : [];
  const normalize = (raw: string) =>
    raw
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9\- ]/g, "");

  const out: string[] = [];
  for (const item of tags) {
    if (typeof item !== "string") continue;
    const next = normalize(item);
    if (!next) continue;
    if (out.some((existing) => existing === next)) continue;
    out.push(next);
  }
  return out;
}

export type NormalizedWorkHistoryItem = {
  id: string;
  role: string;
  company: string;
  start?: string | null;
  end?: string | null;
  details?: string | null;
};

export type NormalizedEducationItem = {
  id: string;
  program: string;
  institution: string;
  start?: string | null;
  end?: string | null;
  details?: string | null;
};

function buildStableKey(parts: Array<string | null | undefined>) {
  return parts
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim())
    .join("|");
}

export function extractBreezyWorkHistory(
  details: unknown,
  buildId: (stableKey: string) => string
): NormalizedWorkHistoryItem[] {
  if (!isRecord(details)) return [];
  const profile = isRecord(details.profile) ? (details.profile as UnknownRecord) : null;
  const sources: unknown[] = [
    details.work_history,
    details.workHistory,
    profile?.work_history,
    profile?.workHistory,
    (isRecord(details.resume) ? (details.resume as UnknownRecord) : null)?.work_history,
    (isRecord(details.resume) ? (details.resume as UnknownRecord) : null)?.workHistory,
    (isRecord(details.parsed_resume) ? (details.parsed_resume as UnknownRecord) : null)
      ?.work_history,
  ];

  let items: UnknownRecord[] = [];
  for (const source of sources) {
    const candidate = extractArray(source);
    if (candidate.length > 0) {
      items = candidate;
      break;
    }
  }
  if (items.length === 0) return [];

  return items
    .map((item, index) => {
      const role = pickFirstString(
        item.role,
        item.title,
        item.position,
        item.job_title,
        item.jobTitle,
        item.position_title,
        item.positionTitle
      );
      const companyObj = isRecord(item.company) ? (item.company as UnknownRecord) : null;
      const employerObj = isRecord(item.employer) ? (item.employer as UnknownRecord) : null;
      const orgObj = isRecord(item.organization) ? (item.organization as UnknownRecord) : null;
      const company = pickFirstString(
        item.company_name,
        item.companyName,
        item.organization_name,
        item.organizationName,
        item.employer_name,
        item.employerName,
        item.company,
        item.organization,
        item.employer,
        item.employment,
        item.institution,
        companyObj?.name,
        employerObj?.name,
        orgObj?.name
      );
      const start = pickFirstString(
        extractMonthYearLabel(item.start),
        extractMonthYearLabel(item.start_date),
        extractMonthYearLabel(item.startDate),
        extractMonthYearLabel(item.from),
        extractMonthYearLabel(item.began),
        extractMonthYearLabel(item.begin)
      );
      const endRaw = pickFirstString(
        extractMonthYearLabel(item.end),
        extractMonthYearLabel(item.end_date),
        extractMonthYearLabel(item.endDate),
        extractMonthYearLabel(item.to),
        extractMonthYearLabel(item.until)
      );
      const isCurrent = isTruthy(item.current) || isTruthy(item.is_current) || isTruthy(item.present);
      const end = isCurrent ? "Present" : endRaw;
      const details = pickFirstString(item.details, item.description, item.summary, item.notes);

      const rawId = pickFirstString(item._id, item.id, item.uuid);
      const stableKey =
        rawId ||
        buildStableKey([
          role,
          company,
          start,
          end,
          details ? details.slice(0, 80) : "",
          String(index),
        ]);
      if (!stableKey || (!role && !company && !details)) return null;
      return {
        id: buildId(`breezy_work|${stableKey}`),
        role: role || "Role",
        company: company || "Company",
        start: start || null,
        end: end || null,
        details: details || null,
      } satisfies NormalizedWorkHistoryItem;
    })
    .filter(Boolean) as NormalizedWorkHistoryItem[];
}

export function extractBreezyEducation(
  details: unknown,
  buildId: (stableKey: string) => string
): NormalizedEducationItem[] {
  if (!isRecord(details)) return [];
  const profile = isRecord(details.profile) ? (details.profile as UnknownRecord) : null;
  const sources: unknown[] = [
    details.education,
    profile?.education,
    (isRecord(details.resume) ? (details.resume as UnknownRecord) : null)?.education,
    (isRecord(details.parsed_resume) ? (details.parsed_resume as UnknownRecord) : null)
      ?.education,
  ];

  let items: UnknownRecord[] = [];
  for (const source of sources) {
    const candidate = extractArray(source);
    if (candidate.length > 0) {
      items = candidate;
      break;
    }
  }
  if (items.length === 0) return [];

  return items
    .map((item, index) => {
      const program = pickFirstString(
        item.program,
        item.degree,
        item.field,
        item.major,
        item.course,
        item.title,
        item.program_name,
        item.programName
      );
      const instObj = isRecord(item.institution) ? (item.institution as UnknownRecord) : null;
      const schoolObj = isRecord(item.school) ? (item.school as UnknownRecord) : null;
      const orgObj = isRecord(item.organization) ? (item.organization as UnknownRecord) : null;
      const institution = pickFirstString(
        item.institution_name,
        item.institutionName,
        item.school_name,
        item.schoolName,
        item.institution,
        item.school,
        item.organization,
        item.university,
        item.company,
        instObj?.name,
        schoolObj?.name,
        orgObj?.name
      );
      const start = pickFirstString(
        extractMonthYearLabel(item.start),
        extractMonthYearLabel(item.start_date),
        extractMonthYearLabel(item.startDate),
        extractMonthYearLabel(item.from)
      );
      const endRaw = pickFirstString(
        extractMonthYearLabel(item.end),
        extractMonthYearLabel(item.end_date),
        extractMonthYearLabel(item.endDate),
        extractMonthYearLabel(item.to)
      );
      const isCurrent = isTruthy(item.current) || isTruthy(item.is_current) || isTruthy(item.present);
      const end = isCurrent ? "Present" : endRaw;
      const details = pickFirstString(item.details, item.description, item.summary, item.notes);

      const rawId = pickFirstString(item._id, item.id, item.uuid);
      const stableKey =
        rawId ||
        buildStableKey([
          program,
          institution,
          start,
          end,
          details ? details.slice(0, 80) : "",
          String(index),
        ]);
      if (!stableKey || (!program && !institution && !details)) return null;
      return {
        id: buildId(`breezy_edu|${stableKey}`),
        program: program || "Program",
        institution: institution || "Institution",
        start: start || null,
        end: end || null,
        details: details || null,
      } satisfies NormalizedEducationItem;
    })
    .filter(Boolean) as NormalizedEducationItem[];
}

export function extractBreezySummary(details: unknown): string {
  if (!isRecord(details)) return "";
  const profile = isRecord(details.profile) ? (details.profile as UnknownRecord) : null;
  const resume = isRecord(details.resume) ? (details.resume as UnknownRecord) : null;
  const parsedResume = isRecord(details.parsed_resume)
    ? (details.parsed_resume as UnknownRecord)
    : null;

  return pickFirstString(
    details.summary,
    details.bio,
    profile?.summary,
    profile?.bio,
    resume?.summary,
    parsedResume?.summary
  );
}

export type BreezyStreamItem = {
  id: string;
  kind: "note" | "activity";
  type: "move" | "note" | "system";
  body: string;
  created_at: string;
  author_name?: string | null;
  author_email?: string | null;
};

export function extractBreezyStreamItems(
  payload: unknown,
  buildId: (stableKey: string) => string
): BreezyStreamItem[] {
  const items = extractArray(payload);
  if (items.length === 0) return [];

  const out: BreezyStreamItem[] = [];
  for (const [index, item] of items.entries()) {
    const rawId = pickFirstString(item._id, item.id, item.event_id, item.eventId);
    const typeRaw = pickFirstString(item.type, item.event, item.kind, item.action, item.name);
    const body = extractStreamBody(item);
    const createdAt = pickFirstString(
      item.created_at,
      item.createdAt,
      item.timestamp,
      item.time,
      item.date
    );
    const user = isRecord(item.user) ? (item.user as UnknownRecord) : null;
    const authorName = pickFirstString(
      item.author_name,
      item.authorName,
      user?.name,
      user?.full_name,
      user?.email_address
    );
    const authorEmail = pickFirstString(
      item.author_email,
      item.authorEmail,
      user?.email,
      user?.email_address
    );

    const lower = typeRaw.toLowerCase();
    const isNote =
      lower.includes("note") ||
      lower.includes("comment") ||
      lower.includes("discussion") ||
      lower.includes("message");
    const isMove = lower.includes("stage") || lower.includes("move") || lower.includes("moved");
    const type: BreezyStreamItem["type"] = isNote ? "note" : isMove ? "move" : "system";
    const kind: BreezyStreamItem["kind"] = type === "note" ? "note" : "activity";

    const normalizedBody =
      body || (kind === "activity" ? humanizeBreezyEventToken(typeRaw) : "");

    const stableKey =
      rawId ||
      buildStableKey([
        typeRaw,
        createdAt,
        authorEmail,
        normalizedBody ? normalizedBody.slice(0, 80) : "",
        String(index),
      ]);
    if (!stableKey) continue;
    const id = buildId(`breezy_stream|${stableKey}`);
    out.push({
      id,
      kind,
      type,
      body: normalizedBody || (kind === "activity" ? "Event" : ""),
      created_at: createdAt || new Date().toISOString(),
      author_name: authorName || null,
      author_email: authorEmail || null,
    });
  }

  return out;
}
