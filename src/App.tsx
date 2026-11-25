import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Activity, ArrowLeft, Bell, BriefcaseBusiness, CalendarClock, CheckCircle2, ChevronDown, CircleAlert, ClipboardList, FileText, Filter, Globe2, LayoutDashboard, LogOut, Menu, Plus, Search, Settings2, ShieldCheck, Users, WalletCards, X } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { AppRole, Profile, VisaCase } from './types'
import SettingsPanel from './SettingsPanel'

const stageColors = ['#64748b', '#2563eb', '#8b5cf6', '#d97706', '#059669', '#0d9488', '#be123c']
const money = (n: number) => new Intl.NumberFormat('en-US').format(n)

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [role, setRole] = useState<AppRole>('employee')
  const [cases, setCases] = useState<VisaCase[]>([])
  const [workflowStages, setWorkflowStages] = useState<{ id: string; name: string; position: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [view, setView] = useState<'overview' | 'cases' | 'settings'>('overview')
  const [showNew, setShowNew] = useState(false)
  const [query, setQuery] = useState('')
  const [mobileNav, setMobileNav] = useState(false)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session?.user) { setProfile(null); setCases([]); setLoading(false); return }
    let active = true
    const load = async () => {
      setLoading(true); setError('')
      const [{ data: p, error: pe }, { data: roles, error: re }, { data: rows, error: ce }, { data: stageRows, error: se }] = await Promise.all([
        supabase!.from('profiles').select('id,full_name,is_active').eq('id', session.user.id).maybeSingle(),
        supabase!.from('user_roles').select('role').eq('user_id', session.user.id),
        supabase!.from('visa_cases').select('*').order('created_at', { ascending: false }).limit(100),
        supabase!.from('workflow_stages').select('id,name,position').order('position')
      ])
      if (!active) return
      if (pe || re || ce || se) setError([pe?.message, re?.message, ce?.message, se?.message].filter(Boolean).join(' · '))
      setProfile(p as Profile | null)
      const found = (roles ?? []).map(x => x.role as AppRole)
      setRole(found.includes('admin') ? 'admin' : found.includes('manager') ? 'manager' : 'employee')
      setCases((rows ?? []) as VisaCase[])
      setWorkflowStages((stageRows ?? []) as { id: string; name: string; position: number }[])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [session])

  const filteredCases = useMemo(() => cases.filter(c => [c.case_number, c.customer_full_name, c.customer_phone].some(v => v?.toLowerCase().includes(query.toLowerCase()))), [cases, query])
  const openCases = cases.filter(c => c.status === 'open' || c.status === 'on_hold')
  const overdue = openCases.filter(c => c.due_at && new Date(c.due_at) < new Date()).length
  const displayName = profile?.full_name || session?.user.email?.split('@')[0] || 'مستخدم'

  async function signIn(e: FormEvent) {
    e.preventDefault(); if (!supabase) return
    setAuthBusy(true); setError('')
    const { error: e1 } = await supabase.auth.signInWithPassword({ email, password })
    if (e1) setError(e1.message)
    setAuthBusy(false)
  }
  async function signOut() { await supabase?.auth.signOut() }

  if (!isSupabaseConfigured) return <SetupScreen />
  if (!session) return <main className="auth-page"><div className="auth-card"><Brand /><div className="auth-copy"><span className="eyebrow">BLUE LINE TRAVEL</span><h1>إدارة معاملات الفيزا،<br/><em>بصورة أوضح.</em></h1><p>منصة داخلية لمتابعة معاملات التأشيرات والوثائق والمراحل التشغيلية.</p></div><form onSubmit={signIn} className="auth-form"><label>البريد الإلكتروني<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@blueline-iq.com" /></label><label>كلمة المرور<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••" /></label>{error && <div className="error-line">{error}</div>}<button className="primary-btn" disabled={authBusy}>{authBusy?'جارٍ تسجيل الدخول...':'تسجيل الدخول'}<ArrowLeft size={18}/></button></form><div className="auth-foot"><ShieldCheck size={15}/> دخول مخصص لموظفي Blue Line Travel</div></div><div className="auth-aside"><div className="orb orb-one"/><div className="orb orb-two"/><div className="aside-content"><span>VISA OPERATIONS / 01</span><h2>كل معاملة<br/>إلها مسار واضح.</h2><p>متابعة منظمة من أول تواصل إلى صدور القرار.</p><div className="aside-stats"><div><b>01</b><small>ملف مستقل لكل طلب</small></div><div><b>02</b><small>مراحل قابلة للتتبع</small></div><div><b>03</b><small>صلاحيات حسب الدور</small></div></div></div></div></main>

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav?'sidebar-open':''}`}><Brand/><div className="workspace"><span className="workspace-dot"/><div><b>Blue Line Travel</b><small>Visa Operations</small></div><ChevronDown size={15}/></div><div className="nav-label">القائمة الرئيسية</div><button className={view==='overview'?'nav-item active':'nav-item'} onClick={()=>{setView('overview');setMobileNav(false)}}><LayoutDashboard size={18}/>نظرة عامة</button><button className={view==='cases'?'nav-item active':'nav-item'} onClick={()=>{setView('cases');setMobileNav(false)}}><BriefcaseBusiness size={18}/>كل المعاملات<span className="nav-count">{cases.length}</span></button><button className="nav-item" onClick={()=>setShowNew(true)}><Plus size={18}/>معاملة جديدة</button><div className="nav-label nav-label-spaced">الإدارة</div><div className="nav-item muted"><Users size={18}/>الموظفون</div><div className="nav-item muted"><WalletCards size={18}/>الحسابات</div>{(role==='manager'||role==='admin') && <button className={view==='settings'?'nav-item active':'nav-item'} onClick={()=>{setView('settings');setMobileNav(false)}}><Settings2 size={18}/>إعدادات النظام</button>}<div className="sidebar-bottom"><div className="profile-chip"><div className="avatar">{displayName.slice(0,1)}</div><div><b>{displayName}</b><small>{role==='admin'?'مدير النظام':role==='manager'?'مدير':'موظف'}</small></div><button onClick={signOut} title="تسجيل الخروج"><LogOut size={17}/></button></div><small className="version">BLUE LINE / INTERNAL SYSTEM</small></div></aside>
    {mobileNav && <button className="scrim" onClick={()=>setMobileNav(false)} aria-label="إغلاق القائمة"/>}
    <main className="main-area"><header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setMobileNav(true)}><Menu/></button><div className="breadcrumb">العمليات <span>/</span> {view==='overview'?'نظرة عامة':'المعاملات'}</div><div className="top-actions"><span className="today">{new Intl.DateTimeFormat('ar-IQ',{dateStyle:'full'}).format(new Date())}</span><button className="icon-btn" title="الإشعارات"><Bell size={18}/><i/></button><div className="top-avatar">{displayName.slice(0,1)}</div></div></header>
      <div className="page-content"><div className="page-heading"><div><span className="eyebrow">VISA OPERATIONS / DASHBOARD</span><h1>{view==='overview'?'نظرة عامة':view==='settings'?'إعدادات النظام':'كل المعاملات'}</h1><p>أهلاً {displayName}، هذا ملخص حركة معاملات الفيزا.</p></div><button className="primary-btn compact" onClick={()=>setShowNew(true)}><Plus size={17}/> معاملة جديدة</button></div>
      {error && <div className="error-banner"><CircleAlert size={17}/>{error}</div>}
      {loading ? <div className="loading-card">جارٍ تحميل بيانات النظام...</div> : <>
        <section className="metrics-grid"><Metric icon={<BriefcaseBusiness/>} label="إجمالي المعاملات" value={cases.length} note="كل الملفات المسجلة" tone="blue"/><Metric icon={<Activity/>} label="قيد الإجراء" value={openCases.length} note="معاملات مفتوحة حالياً" tone="violet"/><Metric icon={<CalendarClock/>} label="متجاوزة الموعد" value={overdue} note="تحتاج إلى متابعة" tone="orange"/><Metric icon={<CheckCircle2/>} label="مكتملة" value={cases.filter(c=>c.status==='completed').length} note="تم إنهاء إجراءاتها" tone="green"/></section>
        {view==='settings' ? <SettingsPanel/> : view==='overview' ? <section className="content-grid"><div className="panel"><div className="panel-head"><div><h2>آخر المعاملات</h2><p>أحدث الملفات التي تم إنشاؤها</p></div><button className="text-btn" onClick={()=>setView('cases')}>عرض الكل <ArrowLeft size={15}/></button></div><CaseTable rows={cases.slice(0,6)}/></div><div className="panel stages-panel"><div className="panel-head"><div><h2>مراحل سير العمل</h2><p>توزيع الملفات حسب المرحلة</p></div><ClipboardList size={19}/></div>{workflowStages.length ? workflowStages.map((s,i)=><div className="stage-row" key={s.id}><span className="stage-dot" style={{background:stageColors[i % stageColors.length]}}/><span>{s.name}</span><b>{cases.filter(c=>c.current_stage_id===s.id).length}</b></div>) : <div className="stage-note"><Globe2 size={16}/> أضف مسارات ومراحل العمل من إعدادات النظام حتى تظهر هنا.</div>}<div className="stage-note"><Globe2 size={16}/> يمكن تخصيص المراحل حسب نوع التأشيرة.</div></div></section> : <section className="panel"><div className="panel-head"><div><h2>سجل المعاملات</h2><p>{filteredCases.length} ملف</p></div><div className="table-tools"><div className="search-box"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث بالاسم أو رقم المعاملة..."/></div><button className="icon-btn" title="تصفية"><Filter size={17}/></button></div></div><CaseTable rows={filteredCases}/></section>}
      </>}
      <footer className="page-footer"><span>Blue Line Travel</span><span>نظام متابعة معاملات التأشيرات · إصدار أولي</span></footer></div>
    </main>
    {showNew && <NewCaseModal onClose={()=>setShowNew(false)} onCreated={async()=>{setShowNew(false);const {data}=await supabase!.from('visa_cases').select('*').order('created_at',{ascending:false}).limit(100);setCases((data??[]) as VisaCase[])}} userId={session.user.id}/>}
  </div>
}

function Brand(){return <div className="brand"><div className="brand-mark">B<span>L</span></div><div><b>BLUE LINE</b><small>TRAVEL & TOURISM</small></div></div>}
function SetupScreen(){return <main className="setup-page"><div className="setup-card"><Brand/><div className="setup-icon"><Settings2/></div><h1>باقي ربط إعدادات الدخول</h1><p>واجهة النظام جاهزة. أضف بيانات Supabase العامة إلى متغيرات البيئة حتى نفعّل تسجيل الدخول.</p><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_ANON_KEY</code><small>استخدم anon / publishable key فقط. لا تضع service role key في الواجهة.</small></div></main>}
function Metric({icon,label,value,note,tone}:{icon:ReactNode;label:string;value:number;note:string;tone:string}){return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><span>{label}</span><strong>{money(value)}</strong><small>{note}</small></div>}
function CaseTable({rows}:{rows:VisaCase[]}){if(!rows.length)return <div className="empty-state"><FileText size={25}/><b>ماكو معاملات لحد الآن</b><span>أنشئ أول معاملة حتى تبدأ المتابعة.</span></div>;return <div className="table-wrap"><table><thead><tr><th>رقم المعاملة</th><th>اسم العميل</th><th>الأولوية</th><th>الحالة</th><th>تاريخ الإنشاء</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td className="case-id">{c.case_number||'—'}</td><td><b>{c.customer_full_name}</b><small>{c.customer_phone||'بدون رقم'}</small></td><td><span className={`priority priority-${c.priority}`}>{c.priority==='urgent'?'عاجل':c.priority==='high'?'مرتفع':c.priority==='low'?'منخفض':'اعتيادي'}</span></td><td><span className={`status status-${c.status}`}>{c.status==='completed'?'مكتملة':c.status==='on_hold'?'معلقة':c.status==='cancelled'?'ملغاة':'قيد الإجراء'}</span></td><td>{new Intl.DateTimeFormat('en-GB').format(new Date(c.created_at))}</td></tr>)}</tbody></table></div>}
function NewCaseModal({onClose,onCreated,userId}:{onClose:()=>void;onCreated:()=>void;userId:string}){const [name,setName]=useState('');const [phone,setPhone]=useState('');const [country,setCountry]=useState('');const [visa,setVisa]=useState('');const [workflow,setWorkflow]=useState('');const [stage,setStage]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [countries,setCountries]=useState<{id:string;name:string}[]>([]);const [visas,setVisas]=useState<{id:string;name:string;country_id:string}[]>([]);const [workflows,setWorkflows]=useState<{id:string;name:string;country_id:string|null;visa_type_id:string|null}[]>([]);const [stagesList,setStagesList]=useState<{id:string;name:string;workflow_id:string;position:number}[]>([])
useEffect(()=>{const load=async()=>{const [a,b,c]=await Promise.all([supabase!.from('countries').select('id,name').eq('is_active',true).order('name'),supabase!.from('visa_types').select('id,name,country_id').eq('is_active',true).order('name'),supabase!.from('workflow_templates').select('id,name,country_id,visa_type_id').eq('is_active',true)]);setCountries(a.data??[]);setVisas(b.data??[]);setWorkflows(c.data??[])};void load()},[])
const filteredVisas=visas.filter(v=>v.country_id===country);const filteredWorkflows=workflows.filter(w=>(!w.country_id||w.country_id===country)&&(!w.visa_type_id||w.visa_type_id===visa))
useEffect(()=>{if(!workflow)return;supabase!.from('workflow_stages').select('id,name,workflow_id,position').eq('workflow_id',workflow).order('position').then(({data})=>{setStagesList(data??[]);setStage(data?.[0]?.id??'')})},[workflow])
async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');const {data,error:e1}=await supabase!.from('visa_cases').insert({created_by:userId,customer_full_name:name.trim(),customer_phone:phone.trim()||null,country_id:country,visa_type_id:visa,workflow_id:workflow,current_stage_id:stage}).select('id').single();if(e1){setError(e1.message);setBusy(false);return}const {data:docReq}=await supabase!.from('document_requirements').select('document_type_id,document_types(name)').eq('visa_type_id',visa);void docReq;setBusy(false);onCreated();void data}
return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><form className="modal-card" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">NEW APPLICATION</span><h2>إنشاء معاملة جديدة</h2><p>كل طلب يُحفظ كملف مستقل للعميل.</p></div><button type="button" className="icon-btn" onClick={onClose}><X/></button></div><label>اسم العميل<input value={name} onChange={e=>setName(e.target.value)} required placeholder="الاسم الكامل"/></label><label>رقم الهاتف<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+964..."/></label><div className="form-row"><label>الدولة<select value={country} onChange={e=>{setCountry(e.target.value);setVisa('');setWorkflow('')}} required><option value="">اختر الدولة</option>{countries.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>نوع الفيزا<select value={visa} onChange={e=>{setVisa(e.target.value);setWorkflow('')}} required disabled={!country}><option value="">اختر النوع</option>{filteredVisas.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label></div><label>مسار المعاملة<select value={workflow} onChange={e=>setWorkflow(e.target.value)} required disabled={!visa}><option value="">اختر المسار</option>{filteredWorkflows.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label>المرحلة الحالية<select value={stage} onChange={e=>setStage(e.target.value)} required disabled={!workflow}><option value="">اختر المرحلة</option>{stagesList.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{error&&<div className="error-line">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>إلغاء</button><button className="primary-btn" disabled={busy||!stage}>{busy?'جارٍ الحفظ...':'حفظ المعاملة'}<Plus size={17}/></button></div></form></div>}
