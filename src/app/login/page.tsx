import { redirect } from "next/navigation";

export default async function LoginRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
      return;
    }
    if (typeof value === "string") query.set(key, value);
  });

  const suffix = query.toString();
  redirect(suffix ? `/admin?${suffix}` : "/admin");
}
