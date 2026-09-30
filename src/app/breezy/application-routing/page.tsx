import { redirect } from "next/navigation";
import { getCurrentUserAccess } from "@/lib/auth/access";
import ApplicationRoutingSettings from "./settings";
export default async function ApplicationRoutingPage() {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/admin?next=/breezy/application-routing");
  if (!access.isAdmin) redirect("/breezy");
  return <ApplicationRoutingSettings />;
}
