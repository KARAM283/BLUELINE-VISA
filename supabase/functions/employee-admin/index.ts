import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Authentication required" }, 401);
    const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Invalid session" }, 401);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: callerRole, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", authData.user.id).eq("role", "admin").maybeSingle();
    const { data: callerProfile } = await admin.from("profiles").select("is_active").eq("id", authData.user.id).maybeSingle();
    if (roleError || !callerRole || !callerProfile?.is_active) return reply({ error: "Only active administrators can manage employee accounts" }, 403);

    const body = await req.json();
    const action = String(body.action || "");
    if (action === "list") {
      const allUsers: any[] = [];
      for (let page = 1; page <= 10; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        allUsers.push(...data.users);
        if (data.users.length < 1000) break;
      }
      const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] = await Promise.all([
        admin.from("profiles").select("id,full_name,is_active,created_at"),
        admin.from("user_roles").select("user_id,role"),
      ]);
      if (profilesError) throw profilesError;
      if (rolesError) throw rolesError;
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const roleMap = new Map<string, string[]>(); for (const r of roles || []) roleMap.set(r.user_id, [...(roleMap.get(r.user_id) || []), r.role]);
      return reply({ users: allUsers.map((u: any) => {
        const p: any = profileMap.get(u.id);
        return { id: u.id, email: u.email || "", full_name: p?.full_name || u.user_metadata?.full_name || "", is_active: p?.is_active ?? true, roles: roleMap.get(u.id) || ["employee"], created_at: u.created_at };
      }) });
    }
    if (action === "create") {
      const fullName = String(body.full_name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const role = String(body.role || "employee");
      if (!fullName || !email || password.length < 8 || !["employee", "manager", "admin"].includes(role)) return reply({ error: "أدخل الاسم والإيميل وكلمة مرور من 8 أحرف على الأقل وصلاحية صحيحة." }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
      if (error) throw error;
      const userId = data.user.id;
      const { error: profileError } = await admin.from("profiles").upsert({ id: userId, full_name: fullName, is_active: true });
      if (profileError) { await admin.auth.admin.deleteUser(userId); throw profileError; }
      const { error: insertRoleError } = await admin.from("user_roles").insert({ user_id: userId, role });
      if (insertRoleError) { await admin.auth.admin.deleteUser(userId); throw insertRoleError; }
      return reply({ success: true, user_id: userId });
    }
    if (action === "update") {
      const userId = String(body.user_id || "");
      if (!userId || userId === authData.user.id) return reply({ error: "لا يمكن تعديل حساب المدير الحالي من هذه الشاشة." }, 400);
      const patch: Record<string, unknown> = {};
      const authPatch: Record<string, unknown> = {};
      if (typeof body.full_name === "string") {
        const fullName = body.full_name.trim();
        if (!fullName) return reply({ error: "الاسم مطلوب." }, 400);
        patch.full_name = fullName;
        authPatch.user_metadata = { full_name: fullName };
      }
      if (typeof body.email === "string") {
        const email = body.email.trim().toLowerCase();
        if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) return reply({ error: "البريد الإلكتروني غير صالح." }, 400);
        authPatch.email = email;
        authPatch.email_confirm = true;
      }
      if (typeof body.password === "string" && body.password.length) {
        if (body.password.length < 8) return reply({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل." }, 400);
        authPatch.password = body.password;
      }
      if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
      if (Object.keys(patch).length) {
        const { error } = await admin.from("profiles").update(patch).eq("id", userId);
        if (error) throw error;
      }
      if (Object.keys(authPatch).length || typeof body.is_active === "boolean") {
        if (typeof body.is_active === "boolean") authPatch.ban_duration = body.is_active ? "none" : "876000h";
        const { error } = await admin.auth.admin.updateUserById(userId, authPatch);
        if (error) throw error;
      }
      if (typeof body.role === "string") {
        if (!["employee", "manager", "admin"].includes(body.role)) return reply({ error: "Invalid role" }, 400);
        const { count, error: countError } = await admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "admin");
        if (countError) throw countError;
        const { data: currentRoles, error: currentError } = await admin.from("user_roles").select("role").eq("user_id", userId);
        if (currentError) throw currentError;
        if ((currentRoles || []).some((r: any) => r.role === "admin") && body.role !== "admin" && (count || 0) <= 1) return reply({ error: "لا يمكن إزالة آخر مدير نظام." }, 400);
        const { error: deleteError } = await admin.from("user_roles").delete().eq("user_id", userId);
        if (deleteError) throw deleteError;
        const { error: insertError } = await admin.from("user_roles").insert({ user_id: userId, role: body.role });
        if (insertError) throw insertError;
      }
      return reply({ success: true });
    }
    return reply({ error: "Unknown action" }, 400);
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Unexpected server error" }, 400);
  }
});