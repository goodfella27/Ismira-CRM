export type ThemePreference = "system" | "light" | "dark";
export const THEME_STORAGE_KEY = "ismira-theme";
export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): "light" | "dark" {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}
export function readThemePreference(
  storage: Pick<Storage, "getItem"> | null,
): ThemePreference {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}
// Static, contains no user-supplied content. Runs before paint, including when storage is blocked.
export const themeInitScript = `(function(){var p='system';try{p=localStorage.getItem('ismira-theme')||'system'}catch(e){}var publicUi=(${isPublicUiRoute.toString()})(location.pathname);var d=!publicUi&&(p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches));document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'})()`;

// Applicant and authentication screens retain their original light design.
export function isPublicUiRoute(pathname: string): boolean {
  return pathname === "/" || ["/admin", "/login", "/register"].includes(pathname) || /^\/(jobs|apply|cv|form|_not-found)(\/|$)/.test(pathname);
}
