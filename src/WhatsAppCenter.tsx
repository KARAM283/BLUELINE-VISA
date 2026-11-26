import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, BarChart3, CheckCheck, CircleAlert, Clock3, Megaphone, MessageCircle, Plus, RefreshCw, Search, Send, Settings2, Users, X } from 'lucide-react'
import { supabase } from './lib/supabase'

type Contact={id:string;phone_e164:string;display_name:string|null;profile_name:string|null;consent_status:string;last_inbound_at:string|null}
type Conversation={id:string;contact_id:string;status:'open'|'pending'|'resolved'|'archived';assigned_to:string|null;priority:string;labels:string[];unread_count:number;last_message_at:string|null;last_message_preview:string|null;window_expires_at:string|null;whatsapp_contacts:Contact}
type Message={id:string;conversation_id:string;direction:'inbound'|'outbound';message_type:string;body:string|null;status:string;occurred_at:string;sent_by:string|null}
type Campaign={id:string;name:string;status:string;template_name:string;template_language:string;scheduled_at:string|null;created_at:string}
type Profile={id:string;full_name:string}
type Tab='inbox'|'campaigns'|'analytics'|'settings'
const fmt=(value:string|null)=>value?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—'
const since=(value:string|null)=>{if(!value)return '—';const n=Math.max(0,Date.now()-new Date(value).getTime());if(n<60000)return 'الآن';if(n<3600000)return Math.floor(n/60000)+' د';if(n<86400000)return Math.floor(n/3600000)+' س';return Math.floor(n/86400000)+' ي'}

export default function WhatsAppCenter({isEnglish,onBack}:{isEnglish:boolean;onBack:()=>void}){
 const [tab,setTab]=useState<Tab>('inbox')
 const [conversations,setConversations]=useState<Conversation[]>([])
 const [messages,setMessages]=useState<Message[]>([])
 const [selectedId,setSelectedId]=useState('')
 const [profiles,setProfiles]=useState<Profile[]>([])
 const [campaigns,setCampaigns]=useState<Campaign[]>([])
 const [contacts,setContacts]=useState<Contact[]>([])
 const [filter,setFilter]=useState('all')
 const [search,setSearch]=useState('')
 const [draft,setDraft]=useState('')
 const [busy,setBusy]=useState(false)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [campaignOpen,setCampaignOpen]=useState(false)
 const [confirmCampaign,setConfirmCampaign]=useState<Campaign|null>(null)
 const [campaignName,setCampaignName]=useState('')
 const [templateName,setTemplateName]=useState('')
 const [templateLanguage,setTemplateLanguage]=useState('en')
 const [campaignDate,setCampaignDate]=useState('')
 const [campaignMode,setCampaignMode]=useState<'draft'|'scheduled'>('draft')
 const [consentOnly,setConsentOnly]=useState(true)
 const tr=(ar:string,en:string)=>isEnglish?en:ar
 const selected=conversations.find(c=>c.id===selectedId)||null

 const load=useCallback(async()=>{
  if(!supabase)return
  setLoading(true);setError('')
  const [c,m,p,camp,people]=await Promise.all([
   supabase.from('whatsapp_conversations').select('id,contact_id,status,assigned_to,priority,labels,unread_count,last_message_at,last_message_preview,window_expires_at,whatsapp_contacts(id,phone_e164,display_name,profile_name,consent_status,last_inbound_at)').order('last_message_at',{ascending:false}).limit(500),
   supabase.from('whatsapp_messages').select('id,conversation_id,direction,message_type,body,status,occurred_at,sent_by').order('occurred_at',{ascending:false}).limit(1000),
   supabase.from('profiles').select('id,full_name').eq('is_active',true).order('full_name'),
   supabase.from('whatsapp_campaigns').select('id,name,status,template_name,template_language,scheduled_at,created_at').order('created_at',{ascending:false}).limit(100),
   supabase.from('whatsapp_contacts').select('id,phone_e164,display_name,profile_name,consent_status,last_inbound_at').order('created_at',{ascending:false}).limit(2000)
  ])
  const firstError=c.error||m.error||p.error||camp.error||people.error
  if(firstError)setError(firstError.message)
  const rows=(c.data||[]) as unknown as Conversation[]
  setConversations(rows);setMessages((m.data||[]) as Message[]);setProfiles((p.data||[]) as Profile[]);setCampaigns((camp.data||[]) as Campaign[]);setContacts((people.data||[]) as Contact[])
  setSelectedId(current=>current&&rows.some(x=>x.id===current)?current:rows[0]?.id||'')
  setLoading(false)
 },[])
 useEffect(()=>{void load()},[load])
 useEffect(()=>{
  if(!supabase)return
  const channel=supabase.channel('whatsapp-center-live')
   .on('postgres_changes',{event:'*',schema:'public',table:'whatsapp_conversations'},()=>{void load()})
   .on('postgres_changes',{event:'*',schema:'public',table:'whatsapp_messages'},()=>{void load()})
   .subscribe()
  return()=>{void supabase?.removeChannel(channel)}
 },[load])
 useEffect(()=>{
  if(!selectedId||!supabase)return
  let alive=true
  supabase.from('whatsapp_messages').select('id,conversation_id,direction,message_type,body,status,occurred_at,sent_by').eq('conversation_id',selectedId).order('occurred_at',{ascending:true}).limit(500).then(({data,error})=>{if(!alive)return;if(error)setError(error.message);else setMessages(current=>[...current.filter(m=>m.conversation_id!==selectedId),...((data||[]) as Message[])])})
  return()=>{alive=false}
 },[selectedId])

 const visible=useMemo(()=>conversations.filter(c=>{
  const q=search.trim().toLowerCase()
  const match=!q||[c.whatsapp_contacts?.display_name,c.whatsapp_contacts?.profile_name,c.whatsapp_contacts?.phone_e164,c.last_message_preview].some(v=>v?.toLowerCase().includes(q))
  return match&&(filter==='all'||(filter==='unassigned'&&!c.assigned_to)||(filter==='unread'&&c.unread_count>0)||c.status===filter)
 }),[conversations,search,filter])
 const selectedMessages=messages.filter(m=>m.conversation_id===selectedId).sort((a,b)=>new Date(a.occurred_at).getTime()-new Date(b.occurred_at).getTime())
 const now=Date.now()
 const activeWindow=Boolean(selected?.window_expires_at&&new Date(selected.window_expires_at).getTime()>now)

 async function updateConversation(patch:Partial<Conversation>){
  if(!supabase||!selected)return
  const {error}=await supabase.from('whatsapp_conversations').update(patch).eq('id',selected.id)
  if(error)setError(error.message);else setConversations(rows=>rows.map(row=>row.id===selected.id?{...row,...patch}:row))
 }
 async function sendMessage(e:React.FormEvent){
  e.preventDefault();if(!supabase||!selected||!draft.trim()||busy)return
  if(!activeWindow){setError(tr('انتهت نافذة الـ24 ساعة. استخدم قالب WhatsApp معتمداً لبدء المحادثة.','The 24-hour customer service window has expired. Use an approved WhatsApp template.'));return}
  setBusy(true);setError('')
  const {data,error}=await supabase.functions.invoke('whatsapp-cloud',{body:{action:'send_text',conversation_id:selected.id,text:draft.trim()}})
  if(error||data?.error)setError(data?.error||error?.message||'Send failed')
  else{setDraft('');setNotice(tr('تم إرسال الرسالة.','Message sent.'));await load()}
  setBusy(false)
 }
 async function createCampaign(e:React.FormEvent){
  e.preventDefault();if(!supabase||!campaignName.trim()||!templateName.trim()||busy)return
  setBusy(true);setError('');setNotice('')
  try{
   const status=campaignMode==='scheduled'?'scheduled':'draft'
   const {data,error}=await supabase.from('whatsapp_campaigns').insert({name:campaignName.trim(),template_name:templateName.trim(),template_language:templateLanguage,audience_filter:{consent_status:consentOnly?'opted_in':'all'},scheduled_at:campaignMode==='scheduled'&&campaignDate?new Date(campaignDate).toISOString():null,status,created_by:(await supabase.auth.getUser()).data.user?.id||null}).select('id,name,status,template_name,template_language,scheduled_at,created_at').single()
   if(error)throw error
   const audience=contacts.filter(c=>!consentOnly||c.consent_status==='opted_in')
   if(audience.length){
    const rows=audience.map(c=>({campaign_id:data.id,contact_id:c.id,phone_e164:c.phone_e164,status:'queued'}))
    const inserted=await supabase.from('whatsapp_campaign_recipients').insert(rows)
    if(inserted.error)throw inserted.error
   }
   setCampaigns(current=>[data as Campaign,...current]);setCampaignOpen(false);setCampaignName('');setTemplateName('');setCampaignDate('')
   setNotice(tr('تم حفظ الحملة وتجهيز '+audience.length+' مستلم. الإرسال يتطلب إعداد Meta وقالباً معتمداً.','Campaign saved with '+audience.length+' recipients. Sending requires Meta setup and an approved template.'))
  }catch(err){setError(err instanceof Error?err.message:'Campaign could not be saved')}
  finally{setBusy(false)}
 }
 async function startCampaign(campaign:Campaign){
  if(!supabase||busy)return
  setConfirmCampaign(null)
  setBusy(true);setError('');setNotice('')
  const {data,error}=await supabase.functions.invoke('whatsapp-cloud',{body:{action:'send_campaign',campaign_id:campaign.id}})
  if(error||data?.error)setError(data?.error||error?.message||'Campaign send failed')
  else setNotice(tr('انتهت دفعة الإرسال: '+data.sent+' أُرسلت، '+data.failed+' فشلت، '+data.remaining+' متبقية.','Batch finished: '+data.sent+' sent, '+data.failed+' failed, '+data.remaining+' remaining.'))
  await load();setBusy(false)
 }
 const totalInbound=messages.filter(m=>m.direction==='inbound').length
 const totalOutbound=messages.filter(m=>m.direction==='outbound').length
 const delivered=messages.filter(m=>m.status==='delivered'||m.status==='read').length
 const failed=messages.filter(m=>m.status==='failed').length
 const responseRate=totalInbound?Math.round(Math.min(totalOutbound,totalInbound)/totalInbound*100):0
 const staffCounts=profiles.map(p=>({name:p.full_name,count:conversations.filter(c=>c.assigned_to===p.id).length,closed:conversations.filter(c=>c.assigned_to===p.id&&c.status==='resolved').length})).sort((a,b)=>b.count-a.count)
 const campaignStatus=(s:string)=>({draft:tr('مسودة','Draft'),scheduled:tr('مجدولة','Scheduled'),processing:tr('قيد الإرسال','Processing'),completed:tr('مكتملة','Completed'),paused:tr('متوقفة','Paused'),cancelled:tr('ملغاة','Cancelled'),failed:tr('فشلت','Failed')}[s]||s)

 return <section className="wa-center">
  <header className="wa-header"><div><button className="secondary-btn" type="button" onClick={onBack}><ArrowLeft size={15}/>{tr('العودة إلى العمليات','Back to operations')}</button><span className="eyebrow">BLUE LINE / CUSTOMER COMMUNICATION</span><h1>WhatsApp Center</h1><p>{tr('مركز موحد للمحادثات والحملات وقياس الأداء.','Unified workspace for conversations, campaigns and performance.')}</p></div><div className="wa-header-actions"><span className="wa-live"><i/> {tr('تحديث مباشر','Live updates')}</span><button className="icon-btn" type="button" onClick={()=>void load()} title="Refresh"><RefreshCw size={17}/></button></div></header>
  <nav className="wa-tabs">
   <button className={tab==='inbox'?'active':''} onClick={()=>setTab('inbox')}><MessageCircle size={16}/> {tr('صندوق المحادثات','Unified Inbox')} <b>{conversations.filter(c=>c.status==='open'||c.status==='pending').length}</b></button>
   <button className={tab==='campaigns'?'active':''} onClick={()=>setTab('campaigns')}><Megaphone size={16}/> {tr('الحملات','Campaigns')}</button>
   <button className={tab==='analytics'?'active':''} onClick={()=>setTab('analytics')}><BarChart3 size={16}/> {tr('التحليلات','Analytics')}</button>
   <button className={tab==='settings'?'active':''} onClick={()=>setTab('settings')}><Settings2 size={16}/> {tr('الإعدادات','Settings')}</button>
  </nav>
  {error&&<div className="wa-alert"><CircleAlert size={16}/>{error}</div>}{notice&&<div className="wa-notice">{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
  {tab==='inbox'&&<div className="wa-inbox">
   <aside className="wa-list">
    <div className="wa-list-head"><div><b>{tr('المحادثات','Conversations')}</b><small>{conversations.length} {tr('محادثة','conversations')}</small></div><button className="icon-btn" title="Refresh" onClick={()=>void load()}><RefreshCw size={15}/></button></div>
    <div className="wa-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={tr('ابحث بالاسم أو الرقم أو الرسالة','Search name, number or message')}/></div>
    <div className="wa-filters">{[['all',tr('الكل','All')],['open',tr('مفتوحة','Open')],['pending',tr('معلقة','Pending')],['unread',tr('غير مقروءة','Unread')],['unassigned',tr('غير مسندة','Unassigned')],['resolved',tr('مغلقة','Resolved')]].map(([v,label])=><button key={v} className={filter===v?'active':''} onClick={()=>setFilter(v)}>{label}</button>)}</div>
    <div className="wa-conversation-list">{loading?<div className="loading-card">{tr('جارٍ تحميل المحادثات...','Loading conversations...')}</div>:visible.length?visible.map(c=><button key={c.id} className={'wa-conversation '+(selectedId===c.id?'selected':'')} onClick={()=>setSelectedId(c.id)}><span className="wa-avatar">{(c.whatsapp_contacts?.display_name||c.whatsapp_contacts?.profile_name||c.whatsapp_contacts?.phone_e164||'?').slice(0,1).toUpperCase()}</span><span className="wa-conversation-copy"><b>{c.whatsapp_contacts?.display_name||c.whatsapp_contacts?.profile_name||c.whatsapp_contacts?.phone_e164}</b><small dir="ltr">{c.whatsapp_contacts?.phone_e164}</small><small className="wa-preview">{c.last_message_preview||tr('لا توجد رسائل','No messages yet')}</small></span><span className="wa-conversation-meta"><small>{since(c.last_message_at)}</small>{c.unread_count>0&&<i>{c.unread_count}</i>}<em className={'wa-status '+c.status}>{c.status}</em></span></button>):<div className="empty-state"><MessageCircle/><b>{tr('لا توجد محادثات','No conversations yet')}</b><span>{tr('ستظهر الرسائل الواردة بعد ربط WhatsApp Cloud API.','Inbound messages appear after connecting WhatsApp Cloud API.')}</span></div>}</div>
   </aside>
   <main className="wa-thread">
    {selected?<><div className="wa-thread-head"><div className="wa-thread-person"><span className="wa-avatar large">{(selected.whatsapp_contacts?.display_name||selected.whatsapp_contacts?.phone_e164||'?').slice(0,1).toUpperCase()}</span><div><b>{selected.whatsapp_contacts?.display_name||selected.whatsapp_contacts?.profile_name||selected.whatsapp_contacts?.phone_e164}</b><small dir="ltr">{selected.whatsapp_contacts?.phone_e164}</small></div></div><div className="wa-thread-tools"><select value={selected.status} onChange={e=>void updateConversation({status:e.target.value as Conversation['status']})}><option value="open">{tr('مفتوحة','Open')}</option><option value="pending">{tr('معلقة','Pending')}</option><option value="resolved">{tr('تم الحل','Resolved')}</option><option value="archived">{tr('مؤرشفة','Archived')}</option></select><select value={selected.assigned_to||''} onChange={e=>void updateConversation({assigned_to:e.target.value||null})}><option value="">{tr('غير مسندة','Unassigned')}</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div></div>
     <div className="wa-thread-info"><span>{tr('الموافقة','Consent')}: <b>{selected.whatsapp_contacts?.consent_status||'unknown'}</b></span><span>{tr('الأولوية','Priority')}: <select value={selected.priority} onChange={e=>void updateConversation({priority:e.target.value})}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></span><span>{activeWindow?tr('نافذة الرد مفتوحة','Reply window open'):tr('نافذة 24 ساعة منتهية','24h window expired')}</span></div>
     <div className="wa-messages">{selectedMessages.map(m=><article key={m.id} className={'wa-bubble '+m.direction}><p>{m.body||'['+m.message_type+']'}</p><small>{fmt(m.occurred_at)} · {m.status} {m.direction==='outbound'&&<CheckCheck size={12}/>}</small></article>)}{!selectedMessages.length&&<div className="empty-state"><MessageCircle/><b>{tr('ابدأ المحادثة','Conversation is empty')}</b></div>}</div>
     <form className="wa-composer" onSubmit={sendMessage}><textarea value={draft} onChange={e=>setDraft(e.target.value)} placeholder={activeWindow?tr('اكتب رسالتك هنا...','Type your message...'):tr('نافذة الرد مغلقة؛ استخدم قالباً معتمداً.','Reply window closed; use an approved template.')} disabled={!activeWindow||busy}/><button className="primary-btn" disabled={!activeWindow||busy||!draft.trim()}><Send size={16}/>{tr('إرسال','Send')}</button></form>
    </>:<div className="empty-state"><MessageCircle/><b>{tr('اختر محادثة','Select a conversation')}</b></div>}
   </main>
  </div>}
  {tab==='campaigns'&&<div className="wa-section"><div className="wa-section-head"><div><h2>{tr('إدارة الحملات','Campaign Manager')}</h2><p>{tr('أنشئ حملات WhatsApp باستخدام قوالب Meta المعتمدة وحدد جمهورك.','Build WhatsApp campaigns with approved Meta templates and a targeted audience.')}</p></div><button className="primary-btn" onClick={()=>setCampaignOpen(true)}><Plus size={16}/>{tr('حملة جديدة','New campaign')}</button></div>
   <div className="wa-kpis"><div><small>{tr('إجمالي الحملات','Total campaigns')}</small><b>{campaigns.length}</b></div><div><small>{tr('جهات الاتصال','Contacts')}</small><b>{contacts.length}</b></div><div><small>{tr('موافقات الإرسال','Opted-in contacts')}</small><b>{contacts.filter(c=>c.consent_status==='opted_in').length}</b></div><div><small>{tr('المجدولة','Scheduled')}</small><b>{campaigns.filter(c=>c.status==='scheduled').length}</b></div></div>
   <div className="wa-table-wrap"><table className="wa-table"><thead><tr><th>{tr('اسم الحملة','Campaign')}</th><th>Template</th><th>{tr('اللغة','Language')}</th><th>{tr('الحالة','Status')}</th><th>{tr('موعد الإرسال','Schedule')}</th><th>{tr('تاريخ الإنشاء','Created')}</th><th>{tr('إجراء','Action')}</th></tr></thead><tbody>{campaigns.map(c=><tr key={c.id}><td><b>{c.name}</b></td><td>{c.template_name}</td><td>{c.template_language}</td><td><span className={'wa-campaign-state '+c.status}>{campaignStatus(c.status)}</span></td><td>{fmt(c.scheduled_at)}</td><td>{fmt(c.created_at)}</td><td>{(c.status==='draft'||c.status==='paused')&&<button className="secondary-btn" disabled={busy} onClick={()=>setConfirmCampaign(c)}><Send size={13}/>{tr('إرسال دفعة','Send batch')}</button>}</td></tr>)}</tbody></table>{!campaigns.length&&<div className="empty-state">{tr('لا توجد حملات بعد.','No campaigns yet.')}</div>}</div>
  </div>}
  {tab==='analytics'&&<div className="wa-section"><div className="wa-section-head"><div><h2>{tr('WhatsApp Analytics','WhatsApp Analytics')}</h2><p>{tr('مؤشرات الأداء من الرسائل والمحادثات المسجلة في النظام.','Performance metrics from messages and conversations recorded in the system.')}</p></div></div>
   <div className="wa-kpis analytics"><div><small>{tr('المحادثات الكلية','Total conversations')}</small><b>{conversations.length}</b><em>{conversations.filter(c=>c.status==='open'||c.status==='pending').length} {tr('نشطة','active')}</em></div><div><small>{tr('الرسائل الواردة','Inbound messages')}</small><b>{totalInbound}</b></div><div><small>{tr('الرسائل الصادرة','Outbound messages')}</small><b>{totalOutbound}</b></div><div><small>{tr('تم التسليم / القراءة','Delivered / read')}</small><b>{delivered}</b></div><div><small>{tr('الرسائل الفاشلة','Failed messages')}</small><b>{failed}</b></div><div><small>{tr('مؤشر الرد التقريبي','Approx. reply ratio')}</small><b>{responseRate}%</b></div></div>
   <div className="wa-analytics-grid"><section className="wa-panel"><h3>{tr('حالة المحادثات','Conversation status')}</h3>{(['open','pending','resolved','archived'] as const).map(s=><div className="wa-bar-row" key={s}><span>{s}</span><div><i style={{width:(conversations.length?conversations.filter(c=>c.status===s).length/conversations.length*100:0)+'%'}}/></div><b>{conversations.filter(c=>c.status===s).length}</b></div>)}</section><section className="wa-panel"><h3>{tr('أداء الموظفين حسب الإسناد','Staff assignment overview')}</h3>{staffCounts.map(s=><div className="wa-staff-row" key={s.name}><span>{s.name}</span><b>{s.count}</b><small>{s.closed} {tr('مغلقة','resolved')}</small></div>)}{!staffCounts.length&&<p className="wa-muted">{tr('لا توجد بيانات موظفين.','No staff data.')}</p>}</section></div>
   <p className="wa-footnote">{tr('ملاحظة: نسبة الرد الحالية مؤشر تقريبي (الصادرة ÷ الواردة)، وليست متوسط زمن الاستجابة. سنضيف قياس زمن أول رد بدقة من الطوابع الزمنية للرسائل.','Note: reply ratio is a rough outbound-to-inbound ratio, not first-response time. Exact first-response metrics require pairing inbound and outbound timestamps.')}</p>
  </div>}
  {tab==='settings'&&<div className="wa-section"><div className="wa-section-head"><div><h2>{tr('إعداد اتصال WhatsApp','WhatsApp connection setup')}</h2><p>{tr('بيانات الاتصال تحفظ في Supabase Edge Function Secrets ولا توضع في المتصفح.','Credentials belong in Supabase Edge Function Secrets, never in the browser.')}</p></div></div><div className="wa-setup-grid"><div><b>Meta WhatsApp Cloud API</b><p>{tr('يلزم رقم هاتف مفعّل على WhatsApp Business Platform، وPhone Number ID، وAccess Token، وWebhook Verify Token.','Requires an active WhatsApp Business Platform number, Phone Number ID, Access Token and Webhook Verify Token.')}</p><ol><li>Create or select a Meta app and add WhatsApp product.</li><li>Configure webhook URL and subscribe to messages.</li><li>Set server secrets: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN, META_APP_SECRET.</li><li>Sync approved message templates before campaigns.</li></ol></div><div><b>{tr('حالة البيانات','Data readiness')}</b><div className="wa-check-row"><span>{tr('جهات الاتصال','Contacts')}</span><b>{contacts.length}</b></div><div className="wa-check-row"><span>{tr('المحادثات','Conversations')}</span><b>{conversations.length}</b></div><div className="wa-check-row"><span>{tr('قوالب محفوظة','Saved templates')}</span><b>—</b></div><div className="wa-check-row"><span>{tr('اتصال Meta','Meta connection')}</span><em>{tr('بانتظار بيانات الربط','Awaiting credentials')}</em></div></div></div></div>}
  {confirmCampaign&&createPortal(<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setConfirmCampaign(null)}}><section className="modal-card global-confirm-modal" role="alertdialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">CAMPAIGN DISPATCH</span><h2>{tr('تأكيد إرسال الحملة','Confirm campaign dispatch')}</h2><p>{tr('سيتم إرسال قالب WhatsApp إلى المستلمين الذين لديهم موافقة موثقة فقط. ستتم معالجة أول 100 مستلم في هذه الدفعة.','Only contacts with recorded opt-in consent will receive the approved template. This batch processes up to 100 recipients.')}</p><b>{confirmCampaign.name}</b></div><button type="button" className="icon-btn" onClick={()=>setConfirmCampaign(null)} disabled={busy}><X/></button></div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setConfirmCampaign(null)} disabled={busy}>{tr('إلغاء','Cancel')}</button><button type="button" className="primary-btn" onClick={()=>void startCampaign(confirmCampaign)} disabled={busy}>{busy?tr('جارٍ الإرسال...','Sending...'):tr('تأكيد الإرسال','Confirm send')}</button></div></section></div>,document.body)}
  {campaignOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setCampaignOpen(false)}}><form className="modal-card wa-campaign-modal" onSubmit={createCampaign}><div className="modal-head"><div><span className="eyebrow">CAMPAIGN BUILDER</span><h2>{tr('إنشاء حملة جديدة','Create campaign')}</h2><p>{tr('يجب استخدام اسم قالب معتمد من Meta.','Use a Meta-approved template name.')}</p></div><button type="button" className="icon-btn" onClick={()=>setCampaignOpen(false)}><X/></button></div><label>{tr('اسم الحملة','Campaign name')}<input value={campaignName} onChange={e=>setCampaignName(e.target.value)} required placeholder="November offers"/></label><label>Meta Template Name<input value={templateName} onChange={e=>setTemplateName(e.target.value)} required placeholder="booking_update"/></label><label>{tr('لغة القالب','Template language')}<select value={templateLanguage} onChange={e=>setTemplateLanguage(e.target.value)}><option value="en">English (en)</option><option value="ar">Arabic (ar)</option><option value="ar_IQ">Arabic Iraq (ar_IQ)</option></select></label><label>{tr('نوع الحملة','Campaign type')}<select value={campaignMode} onChange={e=>setCampaignMode(e.target.value as 'draft'|'scheduled')}><option value="draft">{tr('مسودة','Draft')}</option><option value="scheduled">{tr('مجدولة','Scheduled')}</option></select></label>{campaignMode==='scheduled'&&<label>{tr('موعد الإرسال','Send time')}<input type="datetime-local" value={campaignDate} onChange={e=>setCampaignDate(e.target.value)} required/></label>}<label className="wa-consent-check"><input type="checkbox" checked={consentOnly} onChange={e=>setConsentOnly(e.target.checked)}/>{tr('إرسال فقط إلى جهات الاتصال التي لديها موافقة موثقة (مطلوب للامتثال).','Only include contacts with recorded opt-in consent (recommended for compliance).')}</label><div className="wa-audience-note">{tr('حجم الجمهور الحالي: ','Current audience size: ')}<b>{contacts.filter(c=>!consentOnly||c.consent_status==='opted_in').length}</b></div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setCampaignOpen(false)}>{tr('إلغاء','Cancel')}</button><button className="primary-btn" disabled={busy}>{busy?tr('جارٍ الحفظ...','Saving...'):tr('حفظ الحملة','Save campaign')}</button></div></form></div>}
 </section>
}
