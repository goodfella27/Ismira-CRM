import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_GMAIL_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return NextResponse.redirect("/company?sharedInbox=config_error");
    }

    const url = new URL(request.url);
    const rawNextPath = url.searchParams.get("next") ?? "/company";
    const nextPath = rawNextPath.startsWith("/") ? rawNextPath : "/company";

    const state = crypto.randomUUID();
    const cookieStore = await cookies();

    cookieStore.set("gmail_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });
    cookieStore.set("gmail_oauth_next", nextPath, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });

    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set(
      "scope",
      ["https://www.googleapis.com/auth/gmail.modify"].join(" ")
    );
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("include_granted_scopes", "true");
    authUrl.searchParams.set("state", state);

    return NextResponse.redirect(authUrl.toString());
  } catch (err) {
    console.error("[gmail oauth start] unexpected error", err);
    return NextResponse.redirect("/company?sharedInbox=server_error");
  }
}
