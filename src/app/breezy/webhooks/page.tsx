import Link from "next/link";
export default function Page() {
  return <main className="mx-auto max-w-5xl space-y-4 p-6">
    <h1 className="text-2xl font-semibold">Webhooks</h1>
    <p className="text-muted-foreground">The Breezy integration has been retired. This integration setting is no longer available. Existing CRM records remain in Supabase.</p>
    <Link className="text-primary underline" href="/pipeline">Open CRM pipeline</Link>
  </main>;
}
