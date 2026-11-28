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
 const {data:activeProfile,error:activeProfileError}=await user.from("profiles").select("is_active").eq("id",authUser.id).maybeSingle();
 if(activeProfileError||!activeProfile?.is_active)return reply(403,{error:"حسابك غير مفعل. تواصل مع المدير."});
 const {data:activeProfile,error:activeProfileError}=await user.from("profiles").select("is_active").eq("id",authUser.id).maybeSingle();
 if(activeProfileError||!activeProfile?.is_active)return reply(403,{error:"حسابك غير مفعل. تواصل مع المدير."});
 const {data:roles}=await user.from("user_roles").select("role").eq("user_id",authUser.id);
 const role=roles?.[0]?.role;
 let body:any={};try{body=await req.json()}catch{return reply(400,{error:"طلب غير صالح."})}
 const action=body.action||"scan";
 if(action!=="scan" && !["admin","manager"].includes(role))return reply(403,{error:"هذه الإعدادات متاحة للمدير فقط."});
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 async function getConfig(){
  const {data,error}=await admin.from("gemini_settings").select("api_key,model").eq("id",true).maybeSingle();
  if(error)throw error;
  return {apiKey:data?.api_key||Deno.env.get("GEMINI_API_KEY")||"",model:data?.model||Deno.env.get("GEMINI_MODEL")||"gemini-3.1-flash-lite"};
 }
 async function listModels(key:string){
  const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",{headers:{"x-goog-api-key":key},signal:AbortSignal.timeout(12000)});
  const t=await r.text();let j:any={};try{j=JSON.parse(t)}catch{}
  if(!r.ok)throw new Error(r.status===401||r.status===403?"مفتاح Gemini غير صحيح أو لا يملك صلاحية API.":r.status===429?"تجاوزت حصة طلبات Gemini.":j?.error?.message||"تعذر جلب موديلات Gemini.");
  return (j.models||[]).filter((m:any)=>(m.supportedGenerationMethods||[]).includes("generateContent")).map((m:any)=>({name:String(m.name||"").replace(/^models\//,""),displayName:m.displayName||m.name})).filter((m:any)=>m.name).sort((a:any,b:any)=>a.name.localeCompare(b.name));
 }
 if(action==="config"){
  try{const c=await getConfig();return reply(200,{configured:!!c.apiKey,model:c.model,source:c.apiKey?"configured":"missing"})}catch{return reply(500,{error:"تعذر تحميل إعدادات Gemini."})}
 }
 if(action==="save"){
  const key=String(body.apiKey||"").trim(),model=String(body.model||"").trim();
  if(!model||!/^[a-zA-Z0-9._-]{3,100}$/.test(model))return reply(400,{error:"اختر موديل Gemini صالحاً."});
  let current;try{current=await getConfig()}catch{current={apiKey:"",model:""}}
  const nextKey=key||current.apiKey;
  if(!nextKey)return reply(400,{error:"أدخل Gemini API Key أولاً."});
  try{
   const models=await listModels(nextKey);
   if(!models.some((m:any)=>m.name===model))return reply(400,{error:"الموديل المحدد غير متاح لهذا المفتاح. حدّث قائمة الموديلات واختر موديل يدعم generateContent."});
   const {error}=await admin.from("gemini_settings").upsert({id:true,api_key:nextKey,model,updated_at:new Date().toISOString()},{onConflict:"id"});
   if(error)throw error;
   return reply(200,{success:true,model,modelsCount:models.length});
  }catch(e){return reply(400,{error:e instanceof Error?e.message:"تعذر حفظ إعدادات Gemini."})}
 }
 if(action==="models"||action==="test"){
  try{
   const key=String(body.apiKey||"").trim()||(await getConfig()).apiKey;
   if(!key)return reply(400,{error:"أدخل API Key أولاً."});
   const models=await listModels(key);
   return reply(200,{models,success:true});
  }catch(e){return reply(400,{error:e instanceof Error?e.message:"فشل الاتصال بـ Gemini."})}
 }
 const {apiKey,model:configuredModel}=await getConfig();
 let model=configuredModel;
 if(!apiKey)return reply(503,{error:"لم يتم ضبط Gemini API Key. افتح إعدادات النظام ثم Gemini AI."});
 const mimeType=String(body.mimeType||"");
 const base64=String(body.base64||"").replace(/^data:[^,]+,/,"").replace(/\s/g,"");
 if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(mimeType))return reply(415,{error:"ارفع صورة JPG أو PNG أو WEBP أو PDF."});
 if(!base64||base64.length>5600000)return reply(413,{error:"حجم الملف كبير أو فارغ. الحد الأعلى 4 MB."});
 const prompt=`Extract passport data only from visible biographical page. Use MRZ as cross-check. Never guess. Return JSON only:\n{\"first_name\":string|null,\"last_name\":string|null,\"passport_number\":string|null,\"nationality\":string|null,\"date_of_birth\":\"YYYY-MM-DD\"|null,\"issue_date\":\"YYYY-MM-DD\"|null,\"expiry_date\":\"YYYY-MM-DD\"|null,\"issuing_country\":string|null,\"notes\":string|null,\"portrait_bbox\":{\"x\":number,\"y\":number,\"width\":number,\"height\":number}|null}\nPreserve Latin spelling. Split given names and surname correctly. Nationality is printed nationality, not issuing country. Dates only when unambiguous. For image files only, locate the actual printed passport portrait photograph (not the whole passport page, logos or stamps) and return its tight bounding box in normalized coordinates from 0 to 1000 relative to the full image: x and y are top-left, width and height are dimensions. Include a small margin around the photo. If the portrait is not clearly visible, set portrait_bbox to null. For PDFs, always set portrait_bbox to null.`;
 try{
  const requestBody=JSON.stringify({contents:[{role:"user",parts:[{text:prompt},{inline_data:{mime_type:mimeType,data:base64}}]}],generationConfig:{responseMimeType:"application/json",thinkingConfig:{thinkingLevel:"MINIMAL"},maxOutputTokens:900}});
  const candidates=[...new Set([model,"gemini-3.1-flash-lite","gemini-3.5-flash"])];
  let r:Response|null=null,raw:any={},lastMessage="";
  for(let i=0;i<candidates.length;i++){
   try{
    r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(candidates[i])+":generateContent",{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},signal:AbortSignal.timeout(22000),body:requestBody});
    const rawText=await r.text();raw={};try{raw=JSON.parse(rawText)}catch{}
    if(r.ok){if(candidates[i]!==model)model=candidates[i];break;}
    lastMessage=raw?.error?.message||"Gemini request failed";
    const retryable=r.status===503||r.status===500||r.status===429;
    if(!retryable||i===candidates.length-1)break;
   }catch(e){lastMessage=e instanceof Error?e.message:"Gemini connection failed";if(i===candidates.length-1)throw e;}
  }
  if(!r||!r.ok)return reply(r?.status===429?429:r?.status===400?422:502,{error:lastMessage.includes("high demand")?"موديل Gemini مشغول حالياً. جربنا أكثر من موديل احتياطي وما زال الضغط مستمراً. حاول بعد دقيقة.":lastMessage||"فشل Gemini في قراءة الملف."});
  const txt=raw?.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("")||"";
  if(!txt)return reply(422,{error:"لم يستطع الموديل قراءة صفحة البيانات. جرّب صورة أوضح."});
  return reply(200,{data:JSON.parse(txt),model});
 }catch(e){return reply(504,{error:e instanceof DOMException&&e.name==="TimeoutError"?"انتهت مهلة قراءة الجواز (28 ثانية). جرّب صورة أوضح أو موديل Flash أسرع.":e instanceof Error?e.message:"تعذر الاتصال بـ Gemini."})}
});
