"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Loader2, RefreshCw, Inbox } from "lucide-react";
type Application = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  department: string;
  desired_position: string;
  experience: string;
  is_adult: boolean;
  citizenship: string;
  english_level: string;
  language: string;
  position_id: string | null;
  consent_at: string;
  cv_name: string | null;
  created_at: string;
};
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Pagination } from "@/components/ui/pagination";
export default function ApplicationsList() {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/applications?page=${page}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to load applications.");
      setRows(data.applications);
      setTotal(data.total);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to load applications.",
      );
    } finally {
      setLoading(false);
    }
  }, [page]);
  useEffect(() => {
    void load();
  }, [load]);
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return (
    <div>
      <PageHeader
        title="Applications"
        description="Complete applications and private CVs stored in your CRM."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/breezy/application-routing">
                Communication routing
              </Link>
            </Button>
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </Button>
          </>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? (
        <p
          role="status"
          className="flex items-center gap-2 py-12 text-sm text-muted-foreground"
        >
          <Loader2 size={16} className="animate-spin" />
          Loading applications…
        </p>
      ) : (
        !error && (
          <>
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <span>All applications</span>
              <Badge>{total}</Badge>
            </div>
            {!rows.length ? (
              <EmptyState
                icon={<Inbox size={28} />}
                title="No applications yet"
                description="New applications will appear here once candidates submit the form."
              />
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-card">
                {rows.map((row) => (
                  <details key={row.id} className="group">
                    <summary className="cursor-pointer px-5 py-4 transition-colors hover:bg-muted/50">
                      <span className="font-medium">
                        {row.first_name} {row.last_name}
                      </span>
                      <span className="ml-3 break-all text-xs text-muted-foreground">
                        {row.email}
                      </span>
                      <span className="float-right ml-3 text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString()}
                      </span>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {row.desired_position} · {row.department}
                      </p>
                    </summary>
                    <div className="border-t border-border bg-muted/30 px-5 py-5">
                      <dl className="grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                        {Object.entries({
                          Email: row.email,
                          Phone: row.phone,
                          Department: row.department,
                          "Desired position": row.desired_position,
                          Experience: row.experience,
                          "At least 18": row.is_adult ? "Yes" : "No",
                          Citizenship:
                            names.of(row.citizenship) || row.citizenship,
                          "English level": row.english_level,
                          "Form language": row.language,
                          "Position reference":
                            row.position_id || "General application",
                          "Consent recorded": new Date(
                            row.consent_at,
                          ).toLocaleString(),
                        }).map(([label, value]) => (
                          <div key={label}>
                            <dt className="text-xs text-muted-foreground">
                              {label}
                            </dt>
                            <dd className="mt-1 break-words font-medium">
                              {value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {row.cv_name ? (
                        <Button
                          asChild
                          variant="secondary"
                          className="mt-6 max-w-full"
                        >
                          <a href={`/api/applications/${row.id}/cv`}>
                            <Download size={16} />
                            <span className="truncate">{row.cv_name}</span>
                          </a>
                        </Button>
                      ) : (
                        <p className="mt-6 text-xs text-muted-foreground">
                          No CV provided.
                        </p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
            <Pagination
              page={page}
              pages={Math.ceil(total / 25)}
              onPageChange={setPage}
            />
          </>
        )
      )}
    </div>
  );
}
