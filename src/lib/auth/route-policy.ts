export const PUBLIC_ROUTES = [
  "/",
  "/admin",
  "/login",
  "/register",
  "/auth",
  "/form",
  "/cv",
  "/job",
  "/jobs",
  "/api/jobs",
  "/embed",
  "/opengraph-image",
  "/twitter-image",
  "/icon",
  "/apple-icon",
];

export const AUTH_ENTRY_ROUTES = ["/admin", "/login", "/register"];
export const PROTECTED_ROUTES = [
  "/breezy",
  "/calendar",
  "/companies",
  "/company",
  "/intake",
  "/leads",
  "/pipeline",
  "/profile",
];
export const ADMIN_ONLY_ROUTES = ["/company"];

export function isRouteMatch(pathname: string, route: string) {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => isRouteMatch(pathname, route));
}

export function isAuthEntryRoute(pathname: string) {
  return AUTH_ENTRY_ROUTES.some((route) => isRouteMatch(pathname, route));
}

export function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTES.some((route) => isRouteMatch(pathname, route));
}

export function isAdminOnlyRoute(pathname: string) {
  return ADMIN_ONLY_ROUTES.some((route) => isRouteMatch(pathname, route));
}

export function getAuthEntryRedirectDestination(
  pathname: string,
  canAccessHrPortal: boolean
) {
  if (isRouteMatch(pathname, "/admin")) {
    return canAccessHrPortal ? "/pipeline" : null;
  }

  if (!isAuthEntryRoute(pathname)) return null;
  return canAccessHrPortal ? "/pipeline" : "/jobs";
}
