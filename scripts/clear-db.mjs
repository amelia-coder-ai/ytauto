import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Order matters: child tables first, then parents (respects FK constraints)
const tables = [
  "script_scenes",
  "video_scenes",
  "video_jobs",
  "scripts",
  "niche_profile",
  "niche_videos",
  "niches",
];

async function clearTable(table) {
  process.stdout.write(`  Clearing ${table}... `);
  const { error } = await supabase
    .from(table)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    console.log("FAILED");
    console.error(`    ${error.message}`);
  } else {
    console.log("OK");
  }
}

async function run() {
  console.log("Clearing all application data (preserving users table)...\n");

  for (const table of tables) {
    await clearTable(table);
  }

  console.log("\nDone. Users table was preserved.");
}

run().catch(console.error);
