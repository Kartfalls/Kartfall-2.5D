/**
 * Supabase client singleton.
 * Uses the service-role key for server-side operations (bypasses RLS).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

let _client: SupabaseClient | null = null;

function normalizeSupabaseUrl(rawUrl: string): string {
    const value = rawUrl.trim();

    if (value.startsWith("http://") || value.startsWith("https://")) {
        return value;
    }

    if (value.startsWith("postgres://") || value.startsWith("postgresql://")) {
        try {
            const parsed = new URL(value);
            const host = parsed.hostname.toLowerCase();
            const match = host.match(/^db\.([a-z0-9-]+)\.supabase\.co$/);
            if (!match) {
                throw new Error(
                    "For Postgres connection strings, expected host format db.<project-ref>.supabase.co",
                );
            }
            return `https://${match[1]}.supabase.co`;
        } catch (err) {
            throw new Error(
                `Invalid SUPABASE_URL. Use project URL (https://<project-ref>.supabase.co) or a valid Supabase Postgres DSN. ${err instanceof Error ? err.message : ""}`,
            );
        }
    }

    throw new Error(
        "Invalid SUPABASE_URL. Must be https://<project-ref>.supabase.co (preferred) or a Supabase Postgres DSN.",
    );
}

export function getSupabase(): SupabaseClient {
    if (_client) return _client;

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
        throw new Error(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables",
        );
    }

    const supabaseUrl = normalizeSupabaseUrl(env.SUPABASE_URL);

    _client = createClient(supabaseUrl, env.SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false },
    });

    console.log("[Supabase] Client initialised", { url: supabaseUrl });
    return _client;
}
