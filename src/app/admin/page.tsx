import { Suspense } from "react";
import type { Metadata } from "next";

import { LoginPageClient } from "@/components/login-page-client";
import LoginLoading from "@/app/login/loading";

export const metadata: Metadata = {
  title: "Admin Login",
  description: "Log in to the LinAs CRM admin workspace.",
};

export default function AdminPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginPageClient />
    </Suspense>
  );
}
