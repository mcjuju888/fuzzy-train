import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Magic-link landing route. Supabase redirects here with a one-time `code`
 * which is exchanged for a session cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  // Only same-site relative paths are accepted, so a crafted link cannot use
  // the callback as an open redirect.
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/roster";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("Missing sign-in code.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
