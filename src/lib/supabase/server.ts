import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseServiceKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Session-scoped client. Reads and writes are subject to RLS, so this is what
 * server components and route handlers use to act *as the signed-in user*.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component, where cookies are read-only. The
          // middleware refreshes the session, so dropping the write is safe.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS entirely — use it only for writes to the
 * shared cache (opponents/games/reports) after the caller has been
 * authenticated. Never hand this to anything that takes a raw user filter.
 */
export function createAdminClient() {
  return createServerClient<Database>(supabaseUrl(), supabaseServiceKey(), {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // The service-role client is stateless; it must never touch cookies.
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Convenience: the current user, or null. */
export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
