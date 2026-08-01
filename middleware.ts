import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, image optimizer output, and the
     * vendored engine files.
     */
    "/((?!_next/static|_next/image|engine/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm)$).*)",
  ],
};
