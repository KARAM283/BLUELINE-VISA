import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply(405,{error:"Method not allowed"});
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)return reply(401,{error:"سجّل الدخول أولاً."});
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!service)return reply(500,{error:"إعدادات Supabase غير مكتملة."});
 const user=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user:authUser},error:authErr}=await user.auth.getUser(token);
 if(authErr||!authUser)return reply(401,{error:"جلسة الدخول غير صالحة."});
 let body:any={};try{body=await req.json()}catch{return reply(400,{error:"طلب غير صالح."})}
 const mimeType=String(body.mimeType||""),base64=String(body.base64||"").replace(/^data:[^,]+,/,"").replace(/\s/g,"");
 if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(mimeType))return reply(415,{error:"الصيغ المدعومة: PDF وJPG وPNG وWEBP."});
 if(!base64||base64.length>5600000)return reply(413,{error:"الحد الأعلى 4 MB."});
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:settings,error:settingsError}=await admin.from("gemini_settings").select("api_key,model").eq("id",true).maybeSingle();
 if(settingsError)return reply(500,{error:"تعذر تحميل إعدادات Gemini."});
 const apiKey=settings?.api_key||Deno.env.get("GEMINI_API_KEY")||"",model=settings?.model||Deno.env.get("GEMINI_MODEL")||"gemini-3.1-flash-lite";
 if(!apiKey)return reply(503,{error:"لم يتم ضبط Gemini API Key. افتح إعدادات النظام ثم Gemini AI."});
 const prompt="Read the entire airline travel document. It may be an e-ticket receipt, itinerary, ticket confirmation, boarding pass, agency itinerary, multi-airline itinerary, low-cost carrier ticket, PDF export, scan, or screenshot. Layout and language may vary. Extract only visible facts. Never guess. Return JSON only with this schema: {ticket_type:string|null,airline:string|null,booking_reference:string|null,passengers:[{full_name:string|null,ticket_number:string|null}],segments:[{airline:string|null,flight_number:string|null,origin_code:string|null,origin_city:string|null,destination_code:string|null,destination_city:string|null,departure_date:YYYY-MM-DD|null,departure_time:HH:MM|null,arrival_date:YYYY-MM-DD|null,arrival_time:HH:MM|null}],notes:string|null}. Extract every passenger and every flight leg in travel order, including connections and return flights. Preserve ticket numbers and PNR exactly. Normalize dates and times only when unambiguous. Include airport codes and city names if visible. For multiple passengers include each. Never treat a booking reference as a ticket number. Ignore prices, payment data, passport data and unrelated information. Missing or unreadable fields must be null.";
 const requestBody=JSON.stringify({contents:[{role:"user",parts:[{text:prompt},{inline_data:{mime_type:mimeType,data:base64}}]}],generationConfig:{responseMimeType:"application/json",thinkingConfig:{thinkingLevel:"MINIMAL"},maxOutputTokens:3000}});
 const models=[...new Set([model,"gemini-3.1-flash-lite","gemini-3.5-flash"])];
 for(let i=0;i<models.length;i++){try{
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(models[i])+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},signal:AbortSignal.timeout(28000),body:requestBody});
  const rawText=await r.text();let raw:any={};try{raw=JSON.parse(rawText)}catch{}
  if(r.ok){const txt=raw?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||"").join("")||"";if(!txt)return reply(422,{error:"لم يستطع الموديل قراءة بيانات الرحلة."});try{return reply(200,{data:JSON.parse(txt),model:models[i]})}catch{return reply(422,{error:"تعذر تحليل بيانات التذكرة."})}}
  const message=raw?.error?.message||"Gemini request failed";if(![429,500,503].includes(r.status)||i===models.length-1)return reply(r.status===429?429:502,{error:message.includes("high demand")?"موديل Gemini مشغول حالياً. حاول بعد دقيقة.":message});
 }catch(e){if(i===models.length-1)return reply(504,{error:e instanceof Error?e.message:"Gemini connection failed"})}}
 return reply(502,{error:"Gemini request failed"});
});