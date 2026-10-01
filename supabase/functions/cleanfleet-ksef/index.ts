import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createHandler, HttpError } from "./core.js";

const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function authorize(request: Request) {
  const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new HttpError("Zaloguj się ponownie do CleanFleet.", 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError("Zaloguj się ponownie do CleanFleet.", 401);
  const role = await admin.from("user_roles").select("role").eq("user_id", data.user.id).single();
  if (role.error || role.data?.role !== "admin") throw new HttpError("Moduł jest dostępny dla administratora.", 403);
  return data.user.id;
}
Deno.serve(createHandler({ authorize, secret }));
