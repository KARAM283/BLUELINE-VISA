import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return reply(401, { error: "سجّل الدخول أولاً." });
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return reply(500, { error: "إعدادات Supabase غير مكتملة." });

  const userClient = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + bearer } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await userClient.auth.getUser(bearer);
  if (authError || !user) return reply(401, { error: "جلسة الدخول غير صالحة." });
  const { data: roles, error: roleError } = await userClient.from("user_roles").select("role").eq("user_id", user.id);
  if (roleError) return reply(403, { error: "تعذر التحقق من صلاحيات الحساب." });
  if (!(roles || []).some((r: { role: string }) => r.role === "admin")) return reply(403, { error: "إدارة اتصال Pipedrive متاحة لمدير النظام فقط." });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "طلب غير صالح." }); }
  const action = String(body.action || "config");
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  async function getSaved() {
    const { data, error } = await admin.from("pipedrive_settings").select("api_token,company_name,company_domain,is_connected,updated_at,last_synced_at,synced_people_count,synced_organization_count").eq("id", true).maybeSingle();
    if (error) throw error;
    return data;
  }
  async function testToken(apiToken: string) {
    const response = await fetch("https://api.pipedrive.com/v1/users/me?api_token=" + encodeURIComponent(apiToken), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success !== true || !payload?.data?.id) {
      const message = payload?.error || payload?.error_info || "تعذر التحقق من مفتاح Pipedrive.";
      throw new Error(response.status === 401 || response.status === 403 ? "مفتاح API غير صحيح أو منتهي الصلاحية." : String(message));
    }
    return { name: payload.data.name || payload.data.email || "Pipedrive", company: payload.data.company_name || payload.data.company_id?.name || "", domain: payload.data.company_domain || payload.data.company_id?.domain || "" };
  }
  function firstValue(value: unknown): string | null {
    if (Array.isArray(value)) {
      const primary = value.find((x: any) => x?.primary && x?.value);
      const selected = primary || value.find((x: any) => x?.value);
      return selected?.value ? String(selected.value) : null;
    }
    if (value && typeof value === "object" && "value" in value) return String((value as any).value || "") || null;
    return value === null || value === undefined || value === "" ? null : String(value);
  }
  function allValues(value: unknown): string | null {
    if (Array.isArray(value)) {
      const values = value.map((x: any) => x?.value).filter((x: unknown) => x !== null && x !== undefined && String(x).trim() !== "").map(String);
      return values.length ? [...new Set(values)].join(" / ") : null;
    }
    return firstValue(value);
  }
  async function fetchCollection(kind: "persons" | "organizations", apiToken: string) {
    const records: any[] = [];
    let start = 0;
    for (let page = 0; page < 200; page++) {
      const endpoint = "https://api.pipedrive.com/v1/" + kind + "?start=" + start + "&limit=500&api_token=" + encodeURIComponent(apiToken);
      const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success !== true) throw new Error(payload?.error || payload?.error_info || "تعذر جلب " + kind + " من Pipedrive.");
      const rows = Array.isArray(payload.data) ? payload.data : [];
      records.push(...rows);
      const pagination = payload.additional_data?.pagination;
      if (!pagination?.more_items_in_collection || typeof pagination.next_start !== "number") break;
      start = pagination.next_start;
    }
    return records;
  }
  async function upsertChunks(table: string, rows: any[]) {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await admin.from(table).upsert(rows.slice(i, i + 200), { onConflict: "external_id" });
      if (error) throw error;
    }
  }

  let secretToRedact = "";
  try {
    if (action === "config") {
      const saved = await getSaved();
      return reply(200, { configured: !!saved?.api_token, connected: !!saved?.is_connected, companyName: saved?.company_name || "", companyDomain: saved?.company_domain || "", updatedAt: saved?.updated_at || null, lastSyncedAt: saved?.last_synced_at || null, peopleCount: saved?.synced_people_count || 0, organizationCount: saved?.synced_organization_count || 0 });
    }
    if (action === "test" || action === "save") {
      const supplied = String(body.apiToken || "").trim();
      const saved = supplied ? null : await getSaved();
      const apiToken = supplied || saved?.api_token || "";
      secretToRedact = apiToken;
      if (!apiToken) return reply(400, { error: "أدخل Pipedrive API Token أولاً." });
      const account = await testToken(apiToken);
      if (action === "test") return reply(200, { success: true, account });
      const { error } = await admin.from("pipedrive_settings").upsert({ id: true, api_token: apiToken, company_name: account.company || account.name, company_domain: account.domain, is_connected: true, updated_at: new Date().toISOString() }, { onConflict: "id" });
      if (error) throw error;
      return reply(200, { success: true, account });
    }
    if (action === "sync") {
      const saved = await getSaved();
      secretToRedact = saved?.api_token || "";
      if (!saved?.api_token || !saved.is_connected) return reply(400, { error: "اربط حساب Pipedrive أولاً من الإعدادات." });
      const [organizations, persons] = await Promise.all([fetchCollection("organizations", saved.api_token), fetchCollection("persons", saved.api_token)]);
      const syncedAt = new Date().toISOString();
      const organizationRows = organizations.filter(x => x?.id !== undefined && x?.name).map(x => ({
        external_id: String(x.id), name: String(x.name), phone: allValues(x.phone) || allValues(x.phone_numbers),
        address: firstValue(x.address) || firstValue(x.address_formatted_address), website: firstValue(x.website),
        raw_data: x, synced_at: syncedAt
      }));
      const organizationNames = new Map(organizationRows.map(x => [x.external_id, x.name]));
      const peopleRows = persons.filter(x => x?.id !== undefined).map(x => {
        const orgId = x.org_id?.value ?? x.org_id?.id ?? null;
        const name = String(x.name || [x.first_name, x.last_name].filter(Boolean).join(" ") || "Unnamed");
        return { external_id: String(x.id), name, first_name: x.first_name || null, last_name: x.last_name || null, phone: allValues(x.phone), email: allValues(x.email), organization_external_id: orgId === null ? null : String(orgId), organization_name: x.org_id?.name || (orgId === null ? null : organizationNames.get(String(orgId)) || null), raw_data: x, synced_at: syncedAt };
      });
      await upsertChunks("pipedrive_organizations", organizationRows);
      await upsertChunks("pipedrive_people", peopleRows);
      const { error } = await admin.from("pipedrive_settings").update({ last_synced_at: syncedAt, synced_people_count: peopleRows.length, synced_organization_count: organizationRows.length, updated_at: syncedAt }).eq("id", true);
      if (error) throw error;
      return reply(200, { success: true, peopleCount: peopleRows.length, organizationCount: organizationRows.length, syncedAt });
    }
    if (action === "disconnect") {
      const { error } = await admin.from("pipedrive_settings").delete().eq("id", true);
      if (error) throw error;
      return reply(200, { success: true, connected: false });
    }
    return reply(400, { error: "إجراء غير معروف." });
  } catch (error) {
    // Never return credentials or credential-bearing URLs in API error responses.
    const rawMessage = error instanceof Error ? error.message : "حدث خطأ أثناء الاتصال بـ Pipedrive.";
    const safeMessage = rawMessage
      .replace(/api_token=[^&\\s]*/gi, "api_token=[REDACTED]")
      .replace(/access_token=[^&\\s]*/gi, "access_token=[REDACTED]")
      .replace(/key=[^&\\s]*/gi, "key=[REDACTED]");
    return reply(400, { error: secretToRedact ? safeMessage.split(secretToRedact).join("[REDACTED]") : safeMessage });
  }
});
