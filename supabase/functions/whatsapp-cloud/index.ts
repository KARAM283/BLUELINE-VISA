import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// WhatsApp integration was retired from the Blue Line application.
Deno.serve((_req: Request) => new Response(JSON.stringify({ error: "WhatsApp integration is disabled." }), {
  status: 410,
  headers: { "content-type": "application/json" },
}));
