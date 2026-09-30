import { redirect } from "next/navigation";
export default async function LegacyApplicationForm({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (typeof params.positionId === "string") query.set("positionId", params.positionId);
  redirect(`/apply${query.size ? `?${query}` : ""}`);
}
