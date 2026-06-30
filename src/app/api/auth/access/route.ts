import { NextResponse } from "next/server";

import { getCurrentUserAccess } from "@/lib/auth/access";

export const runtime = "nodejs";

export async function GET() {
  const access = await getCurrentUserAccess();
  return NextResponse.json(
    access
      ? {
          authenticated: true,
          role: access.role,
          isAdmin: access.isAdmin,
          accessLevel: access.isAdmin ? "admin" : access.accessLevel,
          canAccessHrPortal: access.canAccessHrPortal,
          canEditHrPortal: access.canEditHrPortal,
          canManageUsers: access.canManageUsers,
          canManagePayments: access.canManagePayments,
          canViewPrivateFields: access.canViewPrivateFields,
          canViewPremium: access.canViewPremium,
          accessUntil: access.accessUntil,
        }
      : {
          authenticated: false,
          role: "Visitor",
          isAdmin: false,
          accessLevel: "visitor",
          canAccessHrPortal: false,
          canEditHrPortal: false,
          canManageUsers: false,
          canManagePayments: false,
          canViewPrivateFields: false,
          canViewPremium: false,
          accessUntil: null,
        },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
