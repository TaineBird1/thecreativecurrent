import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const email = "thecreativecurrent01@gmail.com";

const { data, error } = await supabase.auth.admin.generateLink({
  type: "recovery",
  email,
  options: {
    redirectTo: "https://www.thecreativecurrent.co.za/login",
  },
});

if (error) {
  console.error("Generate link failed:", error);
  process.exit(1);
}

console.log("Action link:", data.properties.action_link);
