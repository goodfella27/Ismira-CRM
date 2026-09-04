const PUBLIC_SHELL_ROUTES = [
  "/",
  "/admin",
  "/login",
  "/register",
  "/auth",
  "/form",
  "/cv",
  "/jobs",
  "/_not-found",
];

const PROTECTED_SHELL_ROUTES = [
  "/breezy",
  "/calendar",
  "/companies",
  "/company",
  "/intake",
  "/leads",
  "/pipeline",
  "/profile",
];

function isRouteMatch(pathname: string, route: string) {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function isPublicShellRoute(pathname: string) {
  if (PUBLIC_SHELL_ROUTES.some((route) => isRouteMatch(pathname, route))) {
    return true;
  }
  return !PROTECTED_SHELL_ROUTES.some((route) => isRouteMatch(pathname, route));
}
