import { redirect } from "next/navigation";
import { getCurrentUserAccess } from "@/lib/auth/access";
import Catalog from "./catalog";
export default async function DesignSystemPage() {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/admin?next=/design-system");
  if (!access.isAdmin) redirect("/breezy");
  return <Catalog />;
}
