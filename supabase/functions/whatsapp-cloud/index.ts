import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") || "";
const GRAPH_VERSION = Deno.env.get("WHATSAPP_GRAPH_VERSION") || "v23.0";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const normalizePhone = (value: string) => value.replace(/[^0-9]/g, "");

async function verifySignature(req: Request, raw: string) {
  if (!APP_SECRET) return true; // Configure META_APP_SECRET to enforce webhook signature verification.
  const signature = req.headers.get("x-hub-signature-256") || "";
  if (!signature.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const expected = "sha256=" + [...digest].map(x => x.toString(16).padStart(2, "0")).join("");
  return expected.length === signature.length && [...expected].every((c, i) => c === signature[i]);
}

async function graphPost(path: string, payload: unknown) {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) throw new Error("WhatsApp Cloud API secrets are missing.");
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || `Meta API error (${response.status})`);
  return result;
}

async function getOrCreateContact(phone: string, profileName?: string) {
  const normalized = normalizePhone(phone);
  const { data: existing, error: findError } = await db.from("whatsapp_contacts").select("*").eq("phone_e164", normalized).maybeSingle();
  if (findError) throw findError;
  if (existing) {
    if (profileName && !existing.profile_name) await db.from("whatsapp_contacts").update({ profile_name: profileName, updated_at: new Date().toISOString() }).eq("id", existing.id);
    return existing;
  }
  const { data, error } = await db.from("whatsapp_contacts").insert({ phone_e164: normalized, profile_name: profileName || null }).select("*").single();
  if (error) throw error;
  return data;
}

async function getOrCreateConversation(contact: any, inboundAt?: string) {
  const { data: active, error: findError } = await db.from("whatsapp_conversations").select("*").eq("contact_id", contact.id).in("status", ["open", "pending"]).order("last_message_at", { ascending: false }).limit(1).maybeSingle();
  if (findError) throw findError;
  if (active) return active;
  const { data, error } = await db.from("whatsapp_conversations").insert({ contact_id: contact.id, status: "open", last_message_at: inboundAt || new Date().toISOString() }).select("*").single();
  if (error) throw error;
  return data;
}

async function processWebhook(payload: any) {
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
    const value = change.value || {};
    const profileByPhone = new Map<string, string>((value.contacts || []).map((c: any) => [normalizePhone(c.wa_id || ""), c.profile?.name || ""]));
    for (const msg of value.messages || []) {
      const providerId = msg.id;
      const eventKey = providerId ? `message:${providerId}` : null;
      if (eventKey) {
        const { error: duplicate } = await db.from("whatsapp_webhook_events").insert({ event_key: eventKey, event_type: "message", payload: msg });
        if (duplicate?.code === "23505") continue;
        if (duplicate) throw duplicate;
      }
      const phone = normalizePhone(msg.from || "");
      if (!phone) continue;
      const contact = await getOrCreateContact(phone, profileByPhone.get(phone));
      const timestamp = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();
      const conversation = await getOrCreateConversation(contact, timestamp);
      const body = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || null;
      const media = msg.image || msg.document || msg.audio || msg.video || msg.sticker || null;
      const { error: saveError } = await db.from("whatsapp_messages").insert({
        conversation_id: conversation.id, contact_id: contact.id, provider_message_id: providerId,
        direction: "inbound", message_type: msg.type || "unknown", body,
        media_id: media?.id || null, media_mime_type: media?.mime_type || null,
        media_file_name: media?.filename || null, status: "received", context: msg,
        occurred_at: timestamp,
      });
      if (saveError && saveError.code !== "23505") throw saveError;
      await db.from("whatsapp_contacts").update({ last_inbound_at: timestamp, updated_at: new Date().toISOString() }).eq("id", contact.id);
      await db.from("whatsapp_conversations").update({
        status: conversation.status === "resolved" || conversation.status === "archived" ? "open" : conversation.status,
        last_message_at: timestamp, last_message_preview: body || `[${msg.type || "media"}]`,
        unread_count: (conversation.unread_count || 0) + 1, window_expires_at: new Date(new Date(timestamp).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      }).eq("id", conversation.id);
      if (eventKey) await db.from("whatsapp_webhook_events").update({ processed_at: new Date().toISOString() }).eq("event_key", eventKey);
    }
    for (const status of value.statuses || []) {
      const key = `status:${status.id}:${status.status}:${status.timestamp || ""}`;
      const { error: eventError } = await db.from("whatsapp_webhook_events").insert({ event_key: key, event_type: "status", payload: status });
      if (eventError?.code === "23505") continue;
      if (eventError) throw eventError;
      const at = status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString();
      const update: Record<string, unknown> = { status: status.status, error_code: status.errors?.[0]?.code?.toString() || null, error_message: status.errors?.[0]?.title || status.errors?.[0]?.message || null };
      if (status.status === "failed") update.status = "failed";
      await db.from("whatsapp_messages").update(update).eq("provider_message_id", status.id);
      const recipientUpdate: Record<string, unknown> = { status: status.status };
      if (status.status === "delivered") recipientUpdate.delivered_at = at;
      if (status.status === "read") recipientUpdate.read_at = at;
      await db.from("whatsapp_campaign_recipients").update(recipientUpdate).eq("provider_message_id", status.id);
      await db.from("whatsapp_webhook_events").update({ processed_at: new Date().toISOString() }).eq("event_key", key);
    }
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN && challenge) return new Response(challenge, { status: 200 });
    return new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = await req.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }

  // Meta webhook payloads have an object field. Process them without requiring a user JWT.
  if (body.object === "whatsapp_business_account") {
    if (!await verifySignature(req, raw)) return json({ error: "Invalid webhook signature" }, 401);
    try { await processWebhook(body); return json({ received: true }); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Webhook processing failed" }, 500); }
  }

  const auth = req.headers.get("authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Authentication required" }, 401);
  const { data: userData, error: authError } = await db.auth.getUser(jwt);
  if (authError || !userData.user) return json({ error: "Invalid session" }, 401);
  const action = body.action;
  try {
    if (action === "send_text") {
      const { data: conversation, error } = await db.from("whatsapp_conversations").select("id,contact_id,window_expires_at,whatsapp_contacts(phone_e164)").eq("id", body.conversation_id).single();
      if (error || !conversation) return json({ error: "Conversation not found" }, 404);
      if (!conversation.window_expires_at || new Date(conversation.window_expires_at).getTime() < Date.now()) return json({ error: "The 24-hour customer service window has expired. Send an approved template instead." }, 400);
      const phone = (conversation as any).whatsapp_contacts.phone_e164;
      const result = await graphPost(`${PHONE_NUMBER_ID}/messages`, { messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "text", text: { preview_url: true, body: String(body.text || "").slice(0, 4096) } });
      const sent = result.messages?.[0];
      const { error: saveError } = await db.from("whatsapp_messages").insert({ conversation_id: conversation.id, contact_id: conversation.contact_id, provider_message_id: sent?.id || null, direction: "outbound", message_type: "text", body: String(body.text || "").slice(0, 4096), status: "sent", sent_by: userData.user.id });
      if (saveError) throw saveError;
      await db.from("whatsapp_conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: String(body.text || "").slice(0, 180), unread_count: 0 }).eq("id", conversation.id);
      return json({ sent: true, message_id: sent?.id || null });
    }
    if (action === "send_template") {
      const { data: conversation, error } = await db.from("whatsapp_conversations").select("id,contact_id,whatsapp_contacts(phone_e164)").eq("id", body.conversation_id).single();
      if (error || !conversation) return json({ error: "Conversation not found" }, 404);
      const result = await graphPost(`${PHONE_NUMBER_ID}/messages`, { messaging_product: "whatsapp", to: (conversation as any).whatsapp_contacts.phone_e164, type: "template", template: { name: body.template_name, language: { code: body.language || "en" }, components: body.components || [] } });
      const sent = result.messages?.[0];
      await db.from("whatsapp_messages").insert({ conversation_id: conversation.id, contact_id: conversation.contact_id, provider_message_id: sent?.id || null, direction: "outbound", message_type: "template", template_name: body.template_name, template_language: body.language || "en", body: null, status: "sent", sent_by: userData.user.id });
      return json({ sent: true, message_id: sent?.id || null });
    }
    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Request failed" }, 500);
  }
});
