import { redirect } from "next/navigation";
import { getCurrentUserAccess } from "@/lib/auth/access";
import ApplicationsList from "./list";
export default async function ApplicationsPage() {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/admin?next=/breezy/applications");
  if (!access.isAdmin) redirect("/breezy");
  return <ApplicationsList />;
}
