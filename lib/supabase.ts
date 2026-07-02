import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface NicheProfileRow {
  id: string;
  niche_id: string;
  tone: string | null;
  style: string | null;
  common_topics: string[];
  hooks: string[];
  keywords: string[];
  audience_type: string | null;
  content_structure_pattern: string | null;
  created_at: string;
}

export interface ScriptRow {
  id: string;
  user_id: string | null;
  niche_id: string | null;
  title: string;
  duration_minutes: number;
  status: "pending" | "generating" | "ready" | "failed";
  created_at: string;
}

export interface ScriptSceneRow {
  id: string;
  script_id: string;
  scene_number: number;
  scene_type: "hook" | "intro" | "section" | "transition" | "outro";
  title: string;
  content: string;
  duration_seconds: number;
  notes: string | null;
  created_at: string;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Public anon client — for client-side reads (respects RLS). */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Create a fresh service-role client (bypasses RLS). */
export function getSupabaseAdmin(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Service-role admin accessor for server-side writes.
 * Creates a fresh client per call to avoid stale env/session state.
 */
export const supabaseAdmin = {
  from(table: string) {
    return getSupabaseAdmin().from(table);
  },
} as unknown as SupabaseClient;
