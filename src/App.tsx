import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Activity, ArrowLeft, Bell, BriefcaseBusiness, CalendarClock, CheckCircle2, ChevronDown, CircleAlert, FileText, FileImage, Upload, ExternalLink, LayoutDashboard, LogOut, Menu, Plus, Search, Settings2, ShieldCheck, Trash2, Users, WalletCards, X, Plane, Trees, Luggage, Compass, MapPin, Globe2, Building2, MessageCircle } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { AppRole, Profile, VisaCase } from './types'
import SettingsPanel from './SettingsPanel'
import DocumentsWorkspace from './DocumentsWorkspace'
import { useLanguage } from './i18n'

const pipelineColors = ['#64748b', '#2563eb', '#8b5cf6', '#d97706', '#059669', '#0d9488', '#be123c']
const money = (n: number) => new Intl.NumberFormat('en-US').format(n)

export default function App() {
  const { language, toggleLanguage, isEnglish } = useLanguage()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [role, setRole] = useState<AppRole>('employee')
  const [cases, setCases] = useState<VisaCase[]>([])
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [view, setView] = useState<'overview' | 'cases' | 'documents' | 'travel-operations' | 'settings'>('overview')
  const [showNew, setShowNew] = useState(false)
  const [selectedCase, setSelectedCase] = useState<VisaCase | null>(null)
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
      const [{ data: p, error: pe }, { data: roles, error: re }, { data: rows, error: ce }] = await Promise.all([
        supabase!.from('profiles').select('id,full_name,is_active').eq('id', session.user.id).maybeSingle(),
        supabase!.from('user_roles').select('role').eq('user_id', session.user.id),
        supabase!.from('visa_cases').select('*').order('created_at', { ascending: false }).limit(100)
      ])
      if (!active) return
      if (pe || re || ce) setError([pe?.message, re?.message, ce?.message].filter(Boolean).join(' · '))
      setProfile(p as Profile | null)
      const found = (roles ?? []).map(x => x.role as AppRole)
      setRole(found.includes('admin') ? 'admin' : found.includes('manager') ? 'manager' : 'employee')
      setCases((rows ?? []) as VisaCase[])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [session])

  useEffect(() => {
    if (!supabase || !session?.user) { setPipelines([]); return }
    let active = true
    supabase.from('visa_pipelines').select('id,name').eq('is_active', true).order('created_at')
      .then(({ data, error: pipelineError }) => {
        if (!active) return
        if (pipelineError) setError(pipelineError.message)
        else setPipelines(data ?? [])
      })
    return () => { active = false }
  }, [session])

  async function createPipeline(name: string) {
    if (!supabase) throw new Error('Supabase is not configured')
    setError('')
    const { data, error: createError } = await supabase.rpc('create_visa_pipeline', { p_name: name })
    if (createError) { setError(createError.message); throw createError }
    const { data: pipelineRows, error: pipelineError } = await supabase.from('visa_pipelines').select('id,name').eq('is_active', true).order('created_at')
    if (pipelineError) { setError(pipelineError.message); throw pipelineError }
    setPipelines(pipelineRows ?? [])
    return data as string
  }

  async function deletePipeline(pipelineId: string) {
    if (!supabase) throw new Error('Supabase is not configured')
    const pipeline = pipelines.find(item => item.id === pipelineId)
    if (!pipeline) return
    const { count, error: countError } = await supabase.from('visa_cases').select('id', { count: 'exact', head: true }).eq('pipeline_id', pipelineId)
    if (countError) throw countError
    if ((count ?? 0) > 0) throw new Error('لا يمكن حذف Pipeline تحتوي على معاملات. انقل المعاملات أولاً.')
    const { error: deleteError } = await supabase.from('visa_pipelines').update({ is_active: false }).eq('id', pipelineId).eq('is_active', true)
    if (deleteError) throw deleteError
    setPipelines(current => current.filter(item => item.id !== pipelineId))
  }

  async function moveCaseToPipeline(caseId: string, pipelineId: string) {
    if (!supabase) return
    setError('')
    const previousCase = cases.find(item => item.id === caseId)
    if (!previousCase || previousCase.pipeline_id === pipelineId) return

    // Optimistic update: move the card immediately while Supabase persists it.
    setCases(current => current.map(item => item.id === caseId ? { ...item, pipeline_id: pipelineId } : item))

    const { data, error: moveError } = await supabase.rpc('move_case_to_pipeline', { p_case_id: caseId, p_pipeline_id: pipelineId })
    if (moveError) {
      setCases(current => current.map(item =>
        item.id === caseId && item.pipeline_id === pipelineId
          ? { ...item, pipeline_id: previousCase.pipeline_id }
          : item
      ))
      setError(moveError.message)
      throw moveError
    }
    if (data) setCases(current => current.map(item => item.id === caseId ? data as VisaCase : item))
  }

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
  if (!session) return <main className="auth-page" lang={language} dir={isEnglish ? 'ltr' : 'rtl'}><div className="auth-card"><div className="auth-language"><button className="language-toggle" onClick={toggleLanguage} type="button">{isEnglish ? 'العربية' : 'English'}</button></div><div className="auth-copy"><span className="eyebrow">BLUE LINE TRAVEL</span><h1>إدارة معاملات الفيزا،<br/><em>بصورة أوضح.</em></h1><p>منصة داخلية لمتابعة معاملات التأشيرات والوثائق والمراحل التشغيلية.</p></div><form onSubmit={signIn} className="auth-form"><label>البريد الإلكتروني<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@blueline-iq.com" /></label><label>كلمة المرور<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••" /></label>{error && <div className="error-line">{error}</div>}<button className="primary-btn" disabled={authBusy}>{authBusy?'جارٍ تسجيل الدخول...':'تسجيل الدخول'}<ArrowLeft size={18}/></button></form><div className="auth-foot"><ShieldCheck size={15}/> دخول مخصص لموظفي Blue Line Travel</div></div><div className="auth-aside" onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();e.currentTarget.style.setProperty("--mx",`${((e.clientX-r.left)/r.width-.5)*22}px`);e.currentTarget.style.setProperty("--my",`${((e.clientY-r.top)/r.height-.5)*22}px`)}} onPointerLeave={e=>{e.currentTarget.style.setProperty("--mx","0px");e.currentTarget.style.setProperty("--my","0px")}}><div className="orb orb-one"/><div className="orb orb-two"/><div className="travel-scene" aria-hidden="true"><div className="travel-grid"/><div className="travel-moon"/><div className="travel-route"><svg viewBox="0 0 700 420" preserveAspectRatio="none"><path d="M40 330 C145 255 180 365 285 260 S430 100 545 170 S610 80 665 45"/></svg><span className="route-dot route-dot-one"/><span className="route-dot route-dot-two"/></div><div className="neon-plane"><Plane size={62} strokeWidth={1.35}/></div><div className="neon-palm palm-one"><Trees size={100} strokeWidth={1.1}/></div><div className="neon-palm palm-two"><Trees size={72} strokeWidth={1.1}/></div><div className="neon-luggage"><Luggage size={39} strokeWidth={1.3}/></div><div className="neon-compass"><Compass size={35} strokeWidth={1.25}/></div><div className="neon-pin"><MapPin size={25}/></div><div className="neon-globe"><Globe2 size={30}/></div><div className="travel-horizon"/></div><div className={`aside-content ${isEnglish ? "aside-content-en" : "aside-content-ar"}`} lang={isEnglish ? "en" : "ar"} dir={isEnglish ? "ltr" : "rtl"}><span>{isEnglish ? "VISA OPERATIONS / 01" : "عمليات التأشيرات / 01"}</span><h2>{isEnglish ? <>Every journey<br/><em>starts with a clear path.</em></> : <>كل رحلة<br/><em>تبدأ بمسار واضح.</em></>}</h2><p>{isEnglish ? "Seamless visa operations, from the first conversation to the final decision." : "إدارة متكاملة لمعاملات التأشيرات، من أول تواصل إلى القرار النهائي."}</p><div className="aside-stats"><div><b>01</b><small>{isEnglish ? "One file per application" : "ملف مستقل لكل معاملة"}</small></div><div><b>02</b><small>{isEnglish ? "Track every stage" : "تابع كل مرحلة بسهولة"}</small></div><div><b>03</b><small>{isEnglish ? "Role-based access" : "صلاحيات حسب دور الموظف"}</small></div></div></div></div></main>

  return <div className="app-shell" lang={language} dir={isEnglish ? 'ltr' : 'rtl'}>
    <aside className={`sidebar ${mobileNav?'sidebar-open':''}`}><Brand/><div className="workspace"><span className="workspace-dot"/><div><b>Blue Line Travel</b><small>Visa Operations</small></div><ChevronDown size={15}/></div><div className="nav-label">القائمة الرئيسية</div><button className={view==='overview'?'nav-item active':'nav-item'} onClick={()=>{setView('overview');setMobileNav(false)}}><LayoutDashboard size={18}/>نظرة عامة</button><button className={view==='cases'?'nav-item active':'nav-item'} onClick={()=>{setView('cases');setMobileNav(false)}}><BriefcaseBusiness size={18}/>VISA<span className="nav-count">{cases.length}</span></button><button className={view==='documents'?'nav-item active':'nav-item'} onClick={()=>{setView('documents');setMobileNav(false)}}><FileText size={18}/>الوثائق</button><button className={view==='travel-operations'?'nav-item active':'nav-item'} onClick={()=>{setView('travel-operations');setMobileNav(false)}}><Plane size={18}/>Travel Operations</button><div className="nav-label nav-label-spaced">الإدارة</div><div className="nav-item muted"><Users size={18}/>الموظفون</div><div className="nav-item muted"><WalletCards size={18}/>الحسابات</div>{(role==='manager'||role==='admin') && <button className={view==='settings'?'nav-item active':'nav-item'} onClick={()=>{setView('settings');setMobileNav(false)}}><Settings2 size={18}/>إعدادات النظام</button>}<div className="sidebar-bottom"><div className="profile-chip"><div className="avatar">{displayName.slice(0,1)}</div><div><b>{displayName}</b><small>{role==='admin'?'مدير النظام':role==='manager'?'مدير':'موظف'}</small></div><button onClick={signOut} title="تسجيل الخروج"><LogOut size={17}/></button></div><small className="version">BLUE LINE / INTERNAL SYSTEM</small></div></aside>
    {mobileNav && <button className="scrim" onClick={()=>setMobileNav(false)} aria-label="إغلاق القائمة"/>}
    <main className="main-area"><header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setMobileNav(true)}><Menu/></button><div className="breadcrumb">العمليات <span>/</span> {view==='overview'?'نظرة عامة':view==='travel-operations'?'Travel Operations':view==='documents'?'الوثائق':view==='settings'?'إعدادات النظام':'المعاملات'}</div><div className="top-actions"><button className="language-toggle" onClick={toggleLanguage} type="button" aria-label="Switch language">{isEnglish ? 'العربية' : 'English'}</button><span className="today">{new Intl.DateTimeFormat(isEnglish ? 'en-GB' : 'ar-IQ',{dateStyle:'full'}).format(new Date())}</span><button className="icon-btn" title="الإشعارات"><Bell size={18}/><i/></button><div className="top-avatar">{displayName.slice(0,1)}</div></div></header>
      <div className="page-content">
      {error && <div className="error-banner"><CircleAlert size={17}/>{error}</div>}
      {loading ? <div className="loading-card">جارٍ تحميل بيانات النظام...</div> : <>
        {view==='overview' && <section className="metrics-grid"><Metric icon={<BriefcaseBusiness/>} label="إجمالي المعاملات" value={cases.length} note="كل الملفات المسجلة" tone="blue"/><Metric icon={<Activity/>} label="قيد الإجراء" value={openCases.length} note="معاملات مفتوحة حالياً" tone="violet"/><Metric icon={<CalendarClock/>} label="متجاوزة الموعد" value={overdue} note="تحتاج إلى متابعة" tone="orange"/><Metric icon={<CheckCircle2/>} label="مكتملة" value={cases.filter(c=>c.status==='completed').length} note="تم إنهاء إجراءاتها" tone="green"/></section>}
        {view==='settings' ? <SettingsPanel/> : view==='documents' ? <DocumentsWorkspace cases={cases} userId={session.user.id}/> : view==='travel-operations' ? <TravelOperationsWorkspace isEnglish={isEnglish}/> : view==='overview' ? <section className="content-grid"><div className="panel"><div className="panel-head"><div><h2>آخر المعاملات</h2><p>أحدث الملفات التي تم إنشاؤها</p></div><button className="text-btn" onClick={()=>setView('cases')}>عرض الكل <ArrowLeft size={15}/></button></div><CaseTable rows={cases.slice(0,6)}/></div><div className="panel stages-panel"><div className="panel-head"><div><h2>{isEnglish ? 'Cases distribution' : 'توزيع المعاملات'}</h2><p>{isEnglish ? 'Number of cases in each pipeline' : 'عدد الملفات داخل كل Pipeline'}</p></div><BriefcaseBusiness size={19}/></div>{pipelines.length ? pipelines.map((pipeline,i)=><div className="pipeline-summary-row" key={pipeline.id}><span className="pipeline-summary-dot" style={{background:pipelineColors[i % pipelineColors.length]}}/><span>{pipeline.name}</span><b>{cases.filter(c=>c.pipeline_id===pipeline.id).length}</b></div>) : <div className="pipeline-summary-note">أضف Pipeline حتى تظهر هنا.</div>}</div></section> : <PipelineBoard pipelines={pipelines} rows={filteredCases} query={query} onQueryChange={setQuery} canManage={role==='manager'||role==='admin'} onCreate={createPipeline} onMove={moveCaseToPipeline} onDelete={deletePipeline} onOpen={setSelectedCase} onAddCase={()=>setShowNew(true)}/>}
      </>}
      <footer className="page-footer"><span>Blue Line Travel</span><span>نظام متابعة معاملات التأشيرات · إصدار أولي</span></footer></div>
    </main>
    {selectedCase && <CaseDetailsModal item={selectedCase} userId={session.user.id} canDelete={role==='manager'||role==='admin'} onClose={()=>setSelectedCase(null)} onDeleted={async()=>{setSelectedCase(null);const {data}=await supabase!.from('visa_cases').select('*').order('created_at',{ascending:false}).limit(100);setCases((data??[]) as VisaCase[])}} onUpdated={async()=>{const {data}=await supabase!.from('visa_cases').select('*').order('created_at',{ascending:false}).limit(100);setCases((data??[]) as VisaCase[])}}/>}
    {showNew && <NewCaseModal onClose={()=>setShowNew(false)} onCreated={async()=>{setShowNew(false);const {data}=await supabase!.from('visa_cases').select('*').order('created_at',{ascending:false}).limit(100);setCases((data??[]) as VisaCase[])}} userId={session.user.id}/>}
  </div>
}

function Brand(){return <div className="brand brand-logo-wrap"><img className="brand-logo" src="/blue-line-watermark.png" alt="Blue Line — Discover the Beyond" /></div>}
function SetupScreen(){return <main className="setup-page"><div className="setup-card"><Brand/><div className="setup-icon"><Settings2/></div><h1>باقي ربط إعدادات الدخول</h1><p>واجهة النظام جاهزة. أضف بيانات Supabase العامة إلى متغيرات البيئة حتى نفعّل تسجيل الدخول.</p><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_ANON_KEY</code><small>استخدم anon / publishable key فقط. لا تضع service role key في الواجهة.</small></div></main>}
function Metric({icon,label,value,note,tone}:{icon:ReactNode;label:string;value:number;note:string;tone:string}){return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><span>{label}</span><strong>{money(value)}</strong><small>{note}</small></div>}
function PipelineBoard({pipelines,rows,query,onQueryChange,canManage,onCreate,onMove,onDelete,onOpen,onAddCase}:{pipelines:{id:string;name:string}[];rows:VisaCase[];query:string;onQueryChange:(value:string)=>void;canManage:boolean;onCreate:(name:string)=>Promise<string>;onMove:(caseId:string,pipelineId:string)=>Promise<void>;onDelete:(pipelineId:string)=>Promise<void>;onOpen:(item:VisaCase)=>void;onAddCase:()=>void}){
  const { isEnglish } = useLanguage()
  const [newName,setNewName]=useState('')
  const [creating,setCreating]=useState(false)
  const [moving,setMoving]=useState<string|null>(null)
  const [localError,setLocalError]=useState('')
  async function create(e:FormEvent){
    e.preventDefault()
    if(!newName.trim()||creating)return
    setCreating(true);setLocalError('')
    try{await onCreate(newName.trim());setNewName('')}catch(err){setLocalError(err instanceof Error?err.message:'تعذر إنشاء Pipeline')}
    finally{setCreating(false)}
  }
  async function removePipeline(pipelineId:string,pipelineName:string){
    if(!canManage)return
    if(!window.confirm(`تأكيد حذف Pipeline "${pipelineName}"؟ لا يمكن حذفها إذا تحتوي على معاملات.`))return
    setLocalError('')
    try{await onDelete(pipelineId)}catch(err){setLocalError(err instanceof Error?err.message:'تعذر حذف Pipeline')}
  }
  async function move(caseId:string,pipelineId:string){
    if(!pipelineId)return
    setMoving(caseId);setLocalError('')
    try{await onMove(caseId,pipelineId)}catch(err){setLocalError(err instanceof Error?err.message:'تعذر نقل الطلب')}
    finally{setMoving(null)}
  }
  return <section className="panel pipelines-panel">
    <div className="panel-head pipelines-heading"><div><span className="eyebrow">VISA / PIPELINES</span><h2>PIPELINES</h2><p>{rows.length} ملف · {pipelines.length} Pipeline</p></div>
      <div className="pipeline-tools"><div className="search-box"><Search size={16}/><input value={query} onChange={e=>onQueryChange(e.target.value)} placeholder="ابحث بالاسم أو رقم المعاملة..."/></div>
      {canManage&&<button type="button" className="primary-btn compact" onClick={onAddCase}><Plus size={16}/>{isEnglish ? "ADD CASE" : "إضافة معاملة"}</button>}{canManage&&<form className="pipeline-create" onSubmit={create}><input aria-label="اسم Pipeline" placeholder="اسم Pipeline جديد" value={newName} onChange={e=>setNewName(e.target.value)} required/><button className="primary-btn compact" disabled={creating||!newName.trim()}><Plus size={16}/>{creating?'جارٍ الإنشاء...':'إضافة Pipeline'}</button></form>}
      </div>
    </div>
    {localError&&<div className="error-banner">{localError}</div>}
    {!pipelines.length?<div className="empty-state"><BriefcaseBusiness size={25}/><b>ماكو Pipelines بعد</b><span>{canManage?'أنشئ أول Pipeline حتى تبدأ بتنظيم طلبات الفيزا.':'ما تم إنشاء Pipelines لحد الآن.'}</span></div>:
      <div className="pipeline-board">{pipelines.map((pipeline,index)=>{
        const items=rows.filter(item=>item.pipeline_id===pipeline.id)
        return <section className="pipeline-column" key={pipeline.id} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');if(id)void move(id,pipeline.id)}}>
          <div className="pipeline-column-head"><span className="pipeline-color" style={{background:pipelineColors[index%pipelineColors.length]}}/><div><b>{pipeline.name}</b><small>Applications</small></div><span className="pipeline-count">{items.length}</span>{canManage&&<button type="button" className="icon-btn pipeline-delete-btn" title="حذف Pipeline" aria-label={`حذف ${pipeline.name}`} onClick={()=>void removePipeline(pipeline.id,pipeline.name)}><Trash2 size={15}/></button>}</div>
          <div className="pipeline-cards">{items.length?items.map(item=><article className="pipeline-case-card" key={item.id} draggable={moving!==item.id} onDragStart={e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',item.id)}}>
            <div className="pipeline-case-top"><span className="case-id">{item.case_number||'—'}</span><span className={`priority priority-${item.priority}`}>{item.priority==='urgent'?'عاجل':item.priority==='high'?'مرتفع':item.priority==='low'?'منخفض':'اعتيادي'}</span></div>
            <b>{item.customer_full_name}</b><small>{item.customer_phone||'بدون رقم هاتف'}</small>
            <div className="pipeline-case-meta"><span className={`status status-${item.status}`}>{item.status==='completed'?'مكتملة':item.status==='on_hold'?'معلقة':item.status==='cancelled'?'ملغاة':'قيد الإجراء'}</span><span>{new Intl.DateTimeFormat('en-GB').format(new Date(item.created_at))}</span></div>
            <label className="pipeline-move-select">نقل إلى Pipeline<select value={pipeline.id} disabled={moving===item.id} onChange={e=>void move(item.id,e.target.value)}><option value={pipeline.id}>{pipeline.name}</option>{pipelines.filter(target=>target.id!==pipeline.id).map(target=><option key={target.id} value={target.id}>{target.name}</option>)}</select></label><button type="button" className="case-open-btn" onClick={()=>onOpen(item)}>فتح ملف المعاملة <ArrowLeft size={13}/></button>
          </article>):<div className="pipeline-drop-empty">{isEnglish ? 'Drag a case here' : 'اسحب المعاملة إلى هنا'}</div>}</div>
        </section>
      })}</div>}
  </section>
}

function CaseTable({rows}:{rows:VisaCase[]}){if(!rows.length)return <div className="empty-state"><FileText size={25}/><b>ماكو معاملات لحد الآن</b><span>أنشئ أول معاملة حتى تبدأ المتابعة.</span></div>;return <div className="table-wrap"><table><thead><tr><th>رقم المعاملة</th><th>اسم العميل</th><th>الأولوية</th><th>الحالة</th><th>تاريخ الإنشاء</th></tr></thead><tbody>{rows.map(c=><tr key={c.id}><td className="case-id">{c.case_number||'—'}</td><td><b>{c.customer_full_name}</b><small>{c.customer_phone||'بدون رقم'}</small></td><td><span className={`priority priority-${c.priority}`}>{c.priority==='urgent'?'عاجل':c.priority==='high'?'مرتفع':c.priority==='low'?'منخفض':'اعتيادي'}</span></td><td><span className={`status status-${c.status}`}>{c.status==='completed'?'مكتملة':c.status==='on_hold'?'معلقة':c.status==='cancelled'?'ملغاة':'قيد الإجراء'}</span></td><td>{new Intl.DateTimeFormat('en-GB').format(new Date(c.created_at))}</td></tr>)}</tbody></table></div>}
function NewCaseModal({onClose,onCreated,userId}:{onClose:()=>void;onCreated:()=>void;userId:string}){
 const { isEnglish } = useLanguage()
 const [firstName,setFirstName]=useState('');const [lastName,setLastName]=useState('');const [passportNumber,setPassportNumber]=useState('');const [nationality,setNationality]=useState('');const [passportIssueDate,setPassportIssueDate]=useState('');const [phone,setPhone]=useState('');const [dateOfBirth,setDateOfBirth]=useState('');const [expireDate,setExpireDate]=useState('');const [country,setCountry]=useState('');const [visa,setVisa]=useState('');const [pipeline,setPipeline]=useState('');const [passportFile,setPassportFile]=useState<File|null>(null);const [files,setFiles]=useState<File[]>([]);const [busy,setBusy]=useState(false);const [ocrBusy,setOcrBusy]=useState(false);const [dragging,setDragging]=useState(false);const [ocrNote,setOcrNote]=useState('');const [error,setError]=useState('');
 const [countries,setCountries]=useState<{id:string;name:string}[]>([]);const [visas,setVisas]=useState<{id:string;name:string;country_id:string}[]>([]);const [pipelines,setPipelines]=useState<{id:string;name:string}[]>([])
 useEffect(()=>{const load=async()=>{const [a,b,c]=await Promise.all([supabase!.from('countries').select('id,name').eq('is_active',true).order('name'),supabase!.from('visa_types').select('id,name,country_id').eq('is_active',true).order('name'),supabase!.from('visa_pipelines').select('id,name').eq('is_active',true).order('created_at')]);setCountries(a.data??[]);setVisas(b.data??[]);setPipelines(c.data??[]) };void load()},[])
 const filteredVisas=visas.filter(v=>v.country_id===country)
 const acceptedTypes=['application/pdf','image/jpeg','image/png','image/webp']
 async function readPassport(file:File){
  setError('');setOcrNote('');
  if(!acceptedTypes.includes(file.type)){setError('ارفع صورة JPG أو PNG أو WEBP أو ملف PDF فقط.');return}
  if(file.size>4*1024*1024){setError('حتى يقدر Gemini يقرأ الجواز، خلي حجم ملف القراءة أقل من 4 MB. تگدر ترفعه كمرفق عادي لحد 20 MB.');return}
  setPassportFile(file);
  if(!supabase)return;
  setOcrBusy(true);
  try{
   const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const result=String(reader.result||'');resolve(result.slice(result.indexOf(',')+1))};reader.onerror=()=>reject(new Error('تعذر قراءة الملف'));reader.readAsDataURL(file)});
   const {data,error:invokeError}=await supabase.functions.invoke('passport-ocr',{body:{fileName:file.name,mimeType:file.type,base64}});
   if(invokeError){
     let detail=invokeError.message||'تعذر الاتصال بخدمة قراءة الجواز.';
     const context=(invokeError as {context?:unknown}).context;
     if(context instanceof Response){try{const body=await context.clone().json();if(body?.error)detail=String(body.error)}catch{try{const body=await context.clone().text();if(body)detail=body.slice(0,500)}catch{}}}
     throw new Error(detail);
    }
   if(data?.error)throw new Error(data.error);
   const extracted=data?.data;
   if(!extracted)throw new Error('لم يتم استخراج بيانات من الملف.');
   if(extracted.first_name)setFirstName(extracted.first_name);
   if(extracted.last_name)setLastName(extracted.last_name);
   if(extracted.passport_number)setPassportNumber(extracted.passport_number);
   if(extracted.nationality)setNationality(extracted.nationality);
   if(extracted.date_of_birth)setDateOfBirth(extracted.date_of_birth);
   if(extracted.issue_date)setPassportIssueDate(extracted.issue_date);
   if(extracted.expiry_date)setExpireDate(extracted.expiry_date);
   setOcrNote('تمت قراءة البيانات بواسطة Gemini. راجع الحقول وصحّح أي معلومة قبل الحفظ.'+(extracted.notes?' '+extracted.notes:''));
  }catch(e){setError(e instanceof Error?e.message:'فشلت قراءة الجواز بواسطة Gemini.');}
  finally{setOcrBusy(false)}
 }
 async function submit(e:FormEvent){
  e.preventDefault();if(!supabase)return;setBusy(true);setError('')
  const fullName=[firstName.trim(),lastName.trim()].filter(Boolean).join(' ')
  if(!fullName){setError('أدخل الاسم الأول واسم العائلة.');setBusy(false);return}
  const result=await supabase.from('visa_cases').insert({created_by:userId,customer_full_name:fullName,customer_first_name:firstName.trim()||null,customer_last_name:lastName.trim()||null,customer_phone:phone.trim()||null,passport_number:passportNumber.trim()||null,nationality:nationality.trim()||null,passport_issue_date:passportIssueDate||null,date_of_birth:dateOfBirth||null,expire_date:expireDate||null,country_id:country,visa_type_id:visa,pipeline_id:pipeline}).select('id').single()
  if(result.error||!result.data){setError(result.error?.message||'تعذر إنشاء المعاملة');setBusy(false);return}
  for(const file of [...(passportFile?[passportFile]:[]),...files]){
   if(file.size>20*1024*1024){setError('الملف '+file.name+' يتجاوز 20 MB.');setBusy(false);onCreated();return}
   if(!acceptedTypes.includes(file.type)){setError('نوع الملف '+file.name+' غير مدعوم. ارفع PDF أو صورة.');setBusy(false);onCreated();return}
   const safeName=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^\.+/,'').slice(-100)||'attachment'
   const path=result.data.id+'/'+crypto.randomUUID()+'-'+safeName
   const uploaded=await supabase.storage.from('visa-case-documents').upload(path,file,{contentType:file.type,upsert:false})
   if(uploaded.error){setError('تم إنشاء المعاملة، لكن تعذر رفع '+file.name+': '+uploaded.error.message);setBusy(false);onCreated();return}
   const saved=await supabase.from('case_documents').insert({case_id:result.data.id,document_type_id:null,storage_path:path,original_filename:file.name,mime_type:file.type,uploaded_by:userId})
   if(saved.error){await supabase.storage.from('visa-case-documents').remove([path]);setError('تعذر تسجيل المرفق '+file.name+': '+saved.error.message);setBusy(false);onCreated();return}
  }
  setBusy(false);onCreated()
 }
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy&&!ocrBusy)onClose()}}><form className="modal-card case-create-modal" onSubmit={submit}>
 <div className="modal-head"><div><span className="eyebrow">NEW APPLICATION</span><h2>إنشاء معاملة جديدة</h2><p>{isEnglish ? 'Upload a passport image or PDF and Gemini will extract the details automatically. Review the image and extracted information before saving.' : 'ارفع صورة الجواز أو PDF وسيقرأ Gemini البيانات تلقائياً. راجع الصورة والبيانات قبل الحفظ.'}</p></div><button type="button" className="icon-btn" onClick={onClose} disabled={busy||ocrBusy}><X/></button></div>
 <div className="case-create-layout">
  <aside className="case-preview-column">
   <div className="case-preview-heading"><div><b>PASSPORT PREVIEW</b><small>{passportFile?passportFile.name:'معاينة الجواز'}</small></div><span>{passportFile?'READY':'NO FILE'}</span></div>
   <div className={dragging?'passport-dropzone is-dragging':'passport-dropzone'} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={e=>{e.preventDefault();setDragging(false)}} onDrop={e=>{e.preventDefault();setDragging(false);const file=e.dataTransfer.files?.[0];if(file)void readPassport(file)}}>
    {passportFile?<FilePreview file={passportFile} large/>:<><div className="passport-drop-icon"><FileText size={23}/></div><b>اسحب صورة الجواز أو ملف PDF هنا</b><span>ستظهر المعاينة هنا بحجم كبير حتى تتأكد من البيانات بعينك</span></>}
    <label className="passport-browse">{passportFile?'تغيير ملف الجواز':'اختيار صورة الجواز'}<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" disabled={ocrBusy||busy} onChange={e=>{const file=e.target.files?.[0];if(file)void readPassport(file);e.currentTarget.value=''}}/></label>
    {ocrBusy&&<small className="passport-reading">جاري تحليل الجواز بواسطة Gemini...</small>}{ocrNote&&<small className="passport-success">{ocrNote}</small>}
   </div>
   <div className="case-preview-attachments"><div className="case-preview-heading"><div><b>ATTACHMENTS PREVIEW</b><small>{files.length} ملف مرفق</small></div></div>
    {files.length?<div className="case-preview-file-list">{files.map((file,index)=><div className="case-preview-file" key={file.name+'-'+file.size+'-'+index}><FilePreview file={file}/><span><b>{file.name}</b><small>{file.type.includes('pdf')?'PDF':'Image'} · {(file.size/1024/1024).toFixed(2)} MB</small></span><button type="button" aria-label="إزالة المرفق" disabled={busy} onClick={()=>setFiles(current=>current.filter((_,i)=>i!==index))}><X size={15}/></button></div>)}</div>:<div className="case-preview-empty">أي صورة أو PDF تضيفه كمرفق راح تظهر معاينته هنا.</div>}
   </div>
  </aside>
  <section className="case-create-fields">
   <div className="form-row"><label>FIRST NAME<input value={firstName} onChange={e=>setFirstName(e.target.value)} required placeholder="Given name(s)"/></label><label>LAST NAME<input value={lastName} onChange={e=>setLastName(e.target.value)} required placeholder="Surname"/></label></div>
   <div className="form-row"><label>PASSPORT NUMBER<input value={passportNumber} onChange={e=>setPassportNumber(e.target.value)} placeholder="Passport number"/></label><label>NATIONALITY<input value={nationality} onChange={e=>setNationality(e.target.value)} placeholder="Nationality"/></label></div>
   <label>PHONE<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+964..."/></label>
   <div className="form-row"><label>DATE OF BIRTH<input type="date" value={dateOfBirth} onChange={e=>setDateOfBirth(e.target.value)}/></label><label>ISSUE DATE<input type="date" value={passportIssueDate} onChange={e=>setPassportIssueDate(e.target.value)}/></label></div>
   <label>EXPIRE DATE<input type="date" value={expireDate} onChange={e=>setExpireDate(e.target.value)}/></label>
   <div className="form-row"><label>الدولة<select value={country} onChange={e=>{setCountry(e.target.value);setVisa('');setPipeline('')}} required><option value="">اختر الدولة</option>{countries.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>نوع الفيزا<select value={visa} onChange={e=>{setVisa(e.target.value);setPipeline('')}} required disabled={!country}><option value="">اختر النوع</option>{filteredVisas.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label></div>
   <label>Pipeline<select value={pipeline} onChange={e=>setPipeline(e.target.value)} required disabled={!visa}><option value="">اختر Pipeline</option>{pipelines.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label className="case-attachment-picker">ATTACHMENTS <span>صور أو ملفات PDF · الحد الأعلى 20 MB لكل ملف</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e=>{setFiles(current=>[...current,...Array.from(e.target.files??[])]);e.currentTarget.value=''}}/></label>
  </section>
 </div>
 {error&&<div className="error-line">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose} disabled={busy||ocrBusy}>إلغاء</button><button className="primary-btn" disabled={busy||ocrBusy||!pipeline}>{busy?'جارٍ الحفظ والرفع...':ocrBusy?'جاري قراءة الجواز...':'حفظ المعاملة'}<Plus size={17}/></button></div>
 </form></div>
}

function FilePreview({file,large=false}:{file:File;large?:boolean}){
 const [url,setUrl]=useState('');
 useEffect(()=>{const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next)},[file]);
 if(!url)return <div className={large?'file-preview-large file-preview-loading':'file-preview-thumb'}/>;
 if(file.type==='application/pdf')return large?<iframe className="file-preview-large file-preview-pdf" src={url} title={file.name}/>:<div className="file-preview-thumb file-preview-pdf-thumb"><FileText size={25}/><small>PDF</small></div>;
 return <img className={large?'file-preview-large':'file-preview-thumb'} src={url} alt={file.name}/>;
}

type CaseAttachment={id:string;storage_path:string;original_filename:string;mime_type:string|null;uploaded_at:string}
function CaseDetailsModal({item,userId,canDelete,onClose,onDeleted,onUpdated}:{item:VisaCase;userId:string;canDelete:boolean;onClose:()=>void;onDeleted:()=>void;onUpdated:()=>void}){
 const [attachments,setAttachments]=useState<CaseAttachment[]>([]);const [busy,setBusy]=useState(false);const [deleting,setDeleting]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('')
 async function load(){if(!supabase)return;const result=await supabase.from('case_documents').select('id,storage_path,original_filename,mime_type,uploaded_at').eq('case_id',item.id).is('document_type_id',null).order('uploaded_at',{ascending:false});if(result.error)setError(result.error.message);setAttachments((result.data??[]) as CaseAttachment[])}
 useEffect(()=>{void load()},[item.id])
 async function addFiles(files:FileList|null){if(!supabase||!files?.length)return;setBusy(true);setError('');setNotice('')
  for(const file of Array.from(files)){
   if(file.size>20*1024*1024){setError('الملف '+file.name+' يتجاوز 20 MB.');continue}
   if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)){setError('نوع الملف '+file.name+' غير مدعوم.');continue}
   const safeName=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^\.+/,'').slice(-100)||'attachment';const path=item.id+'/'+crypto.randomUUID()+'-'+safeName
   const up=await supabase.storage.from('visa-case-documents').upload(path,file,{contentType:file.type,upsert:false});if(up.error){setError(up.error.message);continue}
   const meta=await supabase.from('case_documents').insert({case_id:item.id,document_type_id:null,storage_path:path,original_filename:file.name,mime_type:file.type,uploaded_by:userId})
   if(meta.error){await supabase.storage.from('visa-case-documents').remove([path]);setError(meta.error.message)}
  }
  await load();onUpdated();setBusy(false);if(!error)setNotice('تم تحديث مرفقات المعاملة.')
 }
 async function deleteCase(){if(!supabase||!canDelete||deleting||busy)return;if(!window.confirm(`تأكيد حذف معاملة "${item.customer_full_name}"؟ سيتم حذف بياناتها ومرفقاتها نهائياً.`))return;setDeleting(true);setError('');setNotice('');try{const docs=await supabase.from('case_documents').select('storage_path').eq('case_id',item.id);if(docs.error)throw docs.error;const paths=(docs.data??[]).map(doc=>doc.storage_path);if(paths.length){const removed=await supabase.storage.from('visa-case-documents').remove(paths);if(removed.error)throw removed.error}const result=await supabase.from('visa_cases').delete().eq('id',item.id).select('id').maybeSingle();if(result.error)throw result.error;if(!result.data)throw new Error('لم يتم حذف المعاملة. تحقق من الصلاحيات.');onDeleted()}catch(err){setError(err instanceof Error?err.message:'تعذر حذف المعاملة')}finally{setDeleting(false)}}
 async function openAttachment(file:CaseAttachment){if(!supabase)return;const tab=window.open('about:blank','_blank');const result=await supabase.storage.from('visa-case-documents').createSignedUrl(file.storage_path,120);if(result.error||!result.data?.signedUrl){tab?.close();setError(result.error?.message||'تعذر فتح الملف');return}if(tab)tab.location.href=result.data.signedUrl;else window.location.href=result.data.signedUrl}
 return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="modal-card case-details-modal"><div className="modal-head"><div><span className="eyebrow">VISA / CASE FILE</span><h2>{item.customer_full_name}</h2><p>{item.case_number||'رقم المعاملة غير متوفر'}</p></div><button type="button" className="icon-btn" onClick={onClose}><X/></button></div>
 <div className="case-details-grid"><div><small>NAME</small><b>{item.customer_full_name}</b></div><div><small>PHONE</small><b>{item.customer_phone||'—'}</b></div><div><small>DATE OF BIRTH</small><b>{item.date_of_birth||'—'}</b></div><div><small>EXPIRE DATE</small><b>{item.expire_date||'—'}</b></div></div>
 <div className="case-attachments-section"><div className="case-attachments-head"><div><b>ATTACHMENTS</b><small>{attachments.length} ملف مرفق</small></div><label className="secondary-btn case-add-attachment"><Plus size={15}/> إضافة مرفقات<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={e=>{void addFiles(e.target.files);e.currentTarget.value=''}}/></label></div>
 {attachments.length?<div className="case-attachment-list">{attachments.map(file=><button type="button" className="case-attachment-item" key={file.id} onClick={()=>void openAttachment(file)}><FileText size={18}/><span><b>{file.original_filename}</b><small>{file.mime_type?.includes('pdf')?'PDF':'Image'} · {new Intl.DateTimeFormat('en-GB').format(new Date(file.uploaded_at))}</small></span><ArrowLeft size={15}/></button>)}</div>:<div className="empty-state case-attachments-empty">لا توجد مرفقات لهذه المعاملة بعد.</div>}</div>
 {error&&<div className="error-line">{error}</div>}{notice&&<div className="success-line">{notice}</div>}{busy&&<div className="loading-card">جارٍ رفع المرفقات...</div>}
 <div className="modal-actions">{canDelete&&<button type="button" className="case-delete-btn" onClick={()=>void deleteCase()} disabled={busy||deleting}>{deleting?'جارٍ الحذف...':'حذف المعاملة'}<Trash2 size={16}/></button>}<button type="button" className="secondary-btn" onClick={onClose} disabled={deleting}>إغلاق</button></div></section></div>
}


type CompanyRecord={id:string;name:string;company_number:string;location:string;logo_path:string|null;created_at:string}
type CompanyDisplay=CompanyRecord & {logo_url:string|null}
type CompanyEmployee={id:string;company_id:string;full_name:string;employee_number:string|null;job_title:string|null;department:string|null;phone:string|null;email:string|null;date_of_birth:string|null;nationality:string|null;passport_number:string|null;passport_issue_date:string|null;passport_expiry_date:string|null;passport_path:string|null;profile_photo_path:string|null;created_at:string}
type EmployeeDisplay=CompanyEmployee & {passport_url:string|null;profile_photo_url:string|null}
type EmployeeAttachment={id:string;employee_id:string;file_name:string;file_path:string;mime_type:string|null;file_size:number|null;file_url:string|null;created_at:string}
type IndividualCustomer={id:string;full_name:string;job_title:string|null;department:string|null;phone:string|null;date_of_birth:string|null;nationality:string|null;passport_number:string|null;passport_issue_date:string|null;passport_expiry_date:string|null;passport_path:string|null;profile_photo_path:string|null;parent_customer_id:string|null;source_employee_id:string|null;created_at:string}
type IndividualCustomerDisplay=IndividualCustomer & {passport_url:string|null;profile_photo_url:string|null}

function TravelOperationsWorkspace({isEnglish}:{isEnglish:boolean}){
 const [activeApp,setActiveApp]=useState<string|null>(null)
 const [customerSection,setCustomerSection]=useState<'companies'|'individuals'|null>(null)
 const [companies,setCompanies]=useState<CompanyDisplay[]>([])
 const [companySearch,setCompanySearch]=useState('')
 const [showCompanyForm,setShowCompanyForm]=useState(false)
 const [editingCompany,setEditingCompany]=useState<CompanyDisplay|null>(null)
 const [openedCompany,setOpenedCompany]=useState<CompanyDisplay|null>(null)
 const [companyName,setCompanyName]=useState('')
 const [companyNumber,setCompanyNumber]=useState('')
 const [companyLocation,setCompanyLocation]=useState('')
 const [companyLogo,setCompanyLogo]=useState<File|null>(null)
 const [companyLogoPreview,setCompanyLogoPreview]=useState('')
 const [companiesLoading,setCompaniesLoading]=useState(false)
 const [companySaving,setCompanySaving]=useState(false)
 const [companyError,setCompanyError]=useState('')
 const [companyNotice,setCompanyNotice]=useState('')
 const [employees,setEmployees]=useState<EmployeeDisplay[]>([])
 const [employeesLoading,setEmployeesLoading]=useState(false)
 const [employeeFormOpen,setEmployeeFormOpen]=useState(false)
 const [individualCustomers,setIndividualCustomers]=useState<IndividualCustomerDisplay[]>([])
 const [individualCustomersLoading,setIndividualCustomersLoading]=useState(false)
 const [individualCustomerSearch,setIndividualCustomerSearch]=useState('')
 const [selectedIndividualCustomer,setSelectedIndividualCustomer]=useState<IndividualCustomerDisplay|null>(null)
 const [customerFormOpen,setCustomerFormOpen]=useState(false)
 const [editingIndividualCustomer,setEditingIndividualCustomer]=useState<IndividualCustomerDisplay|null>(null)
 const [customerFamilyParentId,setCustomerFamilyParentId]=useState<string|null>(null)
 const [customerProfileBusy,setCustomerProfileBusy]=useState(false)
 const [employeesSectionOpen,setEmployeesSectionOpen]=useState(false)
 const [editingEmployee,setEditingEmployee]=useState<EmployeeDisplay|null>(null)
 const [employeeDepartment,setEmployeeDepartment]=useState('')
 const [employeeBirth,setEmployeeBirth]=useState('')
 const [employeeNationality,setEmployeeNationality]=useState('')
 const [employeePassportNumber,setEmployeePassportNumber]=useState('')
 const [employeePassportIssue,setEmployeePassportIssue]=useState('')
 const [employeePassportExpiry,setEmployeePassportExpiry]=useState('')
 const [employeePassport,setEmployeePassport]=useState<File|null>(null)
 const [employeePassportPreview,setEmployeePassportPreview]=useState('')
 const [employeeProfilePhoto,setEmployeeProfilePhoto]=useState<File|null>(null)
 const [employeeProfilePhotoPreview,setEmployeeProfilePhotoPreview]=useState('')
 const [employeeAttachments,setEmployeeAttachments]=useState<EmployeeAttachment[]>([])
 const [newEmployeeAttachments,setNewEmployeeAttachments]=useState<File[]>([])
 const [attachmentsLoading,setAttachmentsLoading]=useState(false)
 const [employeeSaving,setEmployeeSaving]=useState(false)
 const [employeeOcrBusy,setEmployeeOcrBusy]=useState(false)
 const [employeeError,setEmployeeError]=useState('')
 const [employeeName,setEmployeeName]=useState('')
 const [employeeTitle,setEmployeeTitle]=useState('')
 const [employeePhone,setEmployeePhone]=useState('')
 const apps=[
  {id:'customers',title:'Customers - Organization',description:'إدارة العملاء والشركات والمؤسسات وبيانات التواصل.',icon:<Building2 size={27}/>,code:'CUSTOMERS / ORGANIZATION'},
  {id:'flights',title:'Flights',description:'مساحة إدارة الرحلات ومعلومات الطيران والحجوزات.',icon:<Plane size={27}/>,code:'FLIGHT OPERATIONS'},
  {id:'whatsapp',title:'WhatsApp',description:'مساحة متابعة محادثات واتساب والتواصل مع العملاء.',icon:<MessageCircle size={27}/>,code:'CUSTOMER COMMUNICATION'}
 ]
 const selected=apps.find(app=>app.id===activeApp)

 async function loadCompanies(){
  const client=supabase
  if(!client)return
  setCompaniesLoading(true);setCompanyError('')
  const {data,error}=await client.from('companies').select('id,name,company_number,location,logo_path,created_at').order('name')
  if(error){setCompanyError(error.message);setCompaniesLoading(false);return}
  const rows=(data??[]) as CompanyRecord[]
  const withLogos=await Promise.all(rows.map(async company=>{
   if(!company.logo_path)return {...company,logo_url:null}
   const signed=await client.storage.from('company-logos').createSignedUrl(company.logo_path,3600)
   return {...company,logo_url:signed.data?.signedUrl??null}
  }))
  setCompanies(withLogos);setCompaniesLoading(false)
 }

 useEffect(()=>{
  if(customerSection==='companies')void loadCompanies()
 },[customerSection])

 useEffect(()=>{const client=supabase;if(customerSection!=='individuals'||!client)return;let alive=true;const load=async()=>{setIndividualCustomersLoading(true);const {data,error}=await client.from('individual_customers').select('*').order('full_name');if(!alive)return;if(error){setEmployeeError(error.message);setIndividualCustomersLoading(false);return}const rows=(data??[]) as IndividualCustomer[];const signed=await Promise.all(rows.map(async row=>{const [passport,photo]=await Promise.all([row.passport_path?client.storage.from('employee-passports').createSignedUrl(row.passport_path,3600):Promise.resolve({data:null}),row.profile_photo_path?client.storage.from('employee-passports').createSignedUrl(row.profile_photo_path,3600):Promise.resolve({data:null})]);return {...row,passport_url:passport.data?.signedUrl??null,profile_photo_url:photo.data?.signedUrl??null}}));if(alive)setIndividualCustomers(signed);setIndividualCustomersLoading(false)};void load();return()=>{alive=false}},[customerSection])

 useEffect(()=>{
  if(!companyLogo){setCompanyLogoPreview('');return}
  const url=URL.createObjectURL(companyLogo);setCompanyLogoPreview(url)
  return()=>URL.revokeObjectURL(url)
 },[companyLogo])

 useEffect(()=>{
  const client=supabase
  if(!openedCompany||!client)return
  let alive=true
  const load=async()=>{
   setEmployeesLoading(true);setEmployeeError('')
   const {data,error}=await client.from('company_employees').select('id,company_id,full_name,employee_number,job_title,department,phone,email,date_of_birth,nationality,passport_number,passport_issue_date,passport_expiry_date,passport_path,profile_photo_path,created_at').eq('company_id',openedCompany.id).order('full_name')
   if(!alive)return
   if(error)setEmployeeError(error.message)
   else {const rows=(data??[]) as CompanyEmployee[];const withPassports=await Promise.all(rows.map(async row=>{const [passport,photo]=await Promise.all([row.passport_path?client.storage.from('employee-passports').createSignedUrl(row.passport_path,3600):Promise.resolve({data:null}),row.profile_photo_path?client.storage.from('employee-passports').createSignedUrl(row.profile_photo_path,3600):Promise.resolve({data:null})]);return {...row,passport_url:passport.data?.signedUrl??null,profile_photo_url:photo.data?.signedUrl??null}}));if(alive)setEmployees(withPassports)}
   setEmployeesLoading(false)
  }
  void load()
  return()=>{alive=false}
 },[openedCompany?.id])

 useEffect(()=>{if(!employeePassport){setEmployeePassportPreview('');return}const url=URL.createObjectURL(employeePassport);setEmployeePassportPreview(url);return()=>URL.revokeObjectURL(url)},[employeePassport])
 useEffect(()=>{if(!employeeProfilePhoto){setEmployeeProfilePhotoPreview('');return}const url=URL.createObjectURL(employeeProfilePhoto);setEmployeeProfilePhotoPreview(url);return()=>URL.revokeObjectURL(url)},[employeeProfilePhoto])

 useEffect(()=>{const client=supabase;if((!employeeFormOpen||!editingEmployee)&&(!customerFormOpen||!editingIndividualCustomer)||!client){if(!employeeFormOpen&&!customerFormOpen)setEmployeeAttachments([]);return}let alive=true;const load=async()=>{setAttachmentsLoading(true);const isCustomer=customerFormOpen;const table=isCustomer?'individual_customer_attachments':'company_employee_attachments';const id=isCustomer?editingIndividualCustomer?.id:editingEmployee?.id;const key=isCustomer?'customer_id':'employee_id';const {data,error}=await client.from(table).select('*').eq(key,id).order('created_at');if(error){if(alive)setEmployeeError(error.message);setAttachmentsLoading(false);return}const rows=(data??[]) as Omit<EmployeeAttachment,'file_url'>[];const withUrls=await Promise.all(rows.map(async row=>{const signed=await client.storage.from('employee-passports').createSignedUrl(row.file_path,3600);return {...row,file_url:signed.data?.signedUrl??null}}));if(alive){setEmployeeAttachments(withUrls);setAttachmentsLoading(false)}};void load();return()=>{alive=false}},[employeeFormOpen,editingEmployee?.id,customerFormOpen,editingIndividualCustomer?.id])

 function startCompanyForm(company:CompanyDisplay|null){
  setEditingCompany(company)
  setCompanyName(company?.name??'')
  setCompanyNumber(company?.company_number??'')
  setCompanyLocation(company?.location??'')
  setCompanyLogo(null)
  setCompanyError('')
  setCompanyNotice('')
  setShowCompanyForm(true)
 }

 async function saveCompany(e:FormEvent){
  e.preventDefault()
  const client=supabase
  if(!client||companySaving)return
  setCompanySaving(true);setCompanyError('');setCompanyNotice('')
  let uploadedPath:string|null=null
  try{
   let companyId=editingCompany?.id
   if(editingCompany){
    const updated=await client.from('companies').update({name:companyName.trim(),company_number:companyNumber.trim(),location:companyLocation.trim()}).eq('id',editingCompany.id)
    if(updated.error)throw updated.error
   }else{
    const created=await client.from('companies').insert({name:companyName.trim(),company_number:companyNumber.trim(),location:companyLocation.trim()}).select('id').single()
    if(created.error)throw created.error
    companyId=created.data.id
   }
   if(companyLogo&&companyId){
    const ext=companyLogo.name.split('.').pop()?.toLowerCase()||'png'
    uploadedPath=companyId+'/'+crypto.randomUUID()+'.'+ext
    const uploaded=await client.storage.from('company-logos').upload(uploadedPath,companyLogo,{contentType:companyLogo.type,upsert:false})
    if(uploaded.error)throw uploaded.error
    const logoUpdate=await client.from('companies').update({logo_path:uploadedPath}).eq('id',companyId)
    if(logoUpdate.error)throw logoUpdate.error
    if(editingCompany?.logo_path)await client.storage.from('company-logos').remove([editingCompany.logo_path])
   }
   setShowCompanyForm(false);setEditingCompany(null);setCompanyLogo(null)
   setCompanyNotice(editingCompany?'تم تحديث بيانات الشركة.':'تمت إضافة الشركة بنجاح.')
   await loadCompanies()
   if(companyId&&openedCompany?.id===companyId){
    const fresh=await client.from('companies').select('id,name,company_number,location,logo_path,created_at').eq('id',companyId).single()
    if(!fresh.error&&fresh.data){
     let logo_url:string|null=null
     if(fresh.data.logo_path){const signed=await client.storage.from('company-logos').createSignedUrl(fresh.data.logo_path,3600);logo_url=signed.data?.signedUrl??null}
     setOpenedCompany({...fresh.data,logo_url})
    }
   }
  }catch(err){
   if(uploadedPath)await client.storage.from('company-logos').remove([uploadedPath])
   setCompanyError(err instanceof Error?err.message:'تعذر حفظ بيانات الشركة')
  }finally{setCompanySaving(false)}
 }

 async function cropPassportPortrait(file:File,bbox:any):Promise<File|null>{
  if(!file.type.startsWith('image/'))return null
  const values=[Number(bbox?.x),Number(bbox?.y),Number(bbox?.width),Number(bbox?.height)]
  if(values.some(value=>!Number.isFinite(value))||values[2]<=0||values[3]<=0)return null
  const [x,y,w,h]=values
  if(x<0||y<0||x+w>1000||y+h>1000)return null
  const sourceUrl=URL.createObjectURL(file)
  try{
   const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Could not decode passport image'));img.src=sourceUrl})
   const sx=x/1000*image.naturalWidth,sy=y/1000*image.naturalHeight,sw=w/1000*image.naturalWidth,sh=h/1000*image.naturalHeight
   const pad=Math.max(sw,sh)*0.08,left=Math.max(0,sx-pad),top=Math.max(0,sy-pad),right=Math.min(image.naturalWidth,sx+sw+pad),bottom=Math.min(image.naturalHeight,sy+sh+pad)
   const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(right-left));canvas.height=Math.max(1,Math.round(bottom-top))
   const context=canvas.getContext('2d');if(!context)return null
   context.drawImage(image,left,top,canvas.width,canvas.height,0,0,canvas.width,canvas.height)
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.92))
   return blob?new File([blob],'employee-profile.jpg',{type:'image/jpeg'}):null
  }finally{URL.revokeObjectURL(sourceUrl)}
 }
 async function readEmployeePassport(file:File){
  const client=supabase
  if(!client)return
  const supported=['application/pdf','image/jpeg','image/png','image/webp']
  if(!supported.includes(file.type)){setEmployeeError(isEnglish?'Use a PDF, JPG, PNG or WEBP passport.':'ارفع جواز بصيغة PDF أو JPG أو PNG أو WEBP.');return}
  if(file.size>4*1024*1024){setEmployeeError(isEnglish?'Gemini reading is limited to 4 MB. The passport can still be saved up to 10 MB.':'قراءة Gemini تتطلب ملفاً أقل من 4 MB. تگدر تحفظ الجواز كمرفق لحد 10 MB.');return}
  setEmployeeOcrBusy(true);setEmployeeError('')
  try{
   const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const result=String(reader.result||'');resolve(result.slice(result.indexOf(',')+1))};reader.onerror=()=>reject(new Error(isEnglish?'Could not read the file':'تعذرت قراءة الملف'));reader.readAsDataURL(file)})
   const {data,error:invokeError}=await client.functions.invoke('passport-ocr',{body:{fileName:file.name,mimeType:file.type,base64}})
   if(invokeError){let detail=invokeError.message||'Gemini OCR failed';const context=(invokeError as {context?:unknown}).context;if(context instanceof Response){try{const body=await context.clone().json();if(body?.error)detail=String(body.error)}catch{}}throw new Error(detail)}
   if(data?.error)throw new Error(data.error)
   const extracted=data?.data
   if(!extracted)throw new Error(isEnglish?'No passport data was detected':'لم يتم استخراج بيانات من الجواز')
   if(extracted.portrait_bbox&&file.type.startsWith('image/')){const portrait=await cropPassportPortrait(file,extracted.portrait_bbox);if(portrait)setEmployeeProfilePhoto(portrait)}
   const fullName=String(extracted.full_name||[extracted.first_name,extracted.last_name].filter(Boolean).join(' ')).trim()
   if(fullName)setEmployeeName(fullName)
   if(extracted.passport_number)setEmployeePassportNumber(String(extracted.passport_number))
   if(extracted.nationality)setEmployeeNationality(String(extracted.nationality))
   if(extracted.date_of_birth)setEmployeeBirth(String(extracted.date_of_birth))
   if(extracted.issue_date)setEmployeePassportIssue(String(extracted.issue_date))
   if(extracted.expiry_date)setEmployeePassportExpiry(String(extracted.expiry_date))
  }catch(error){setEmployeeError((error instanceof Error?error.message:'Gemini OCR failed')+(isEnglish?' — You can enter the details manually.':' — تگدر تدخل البيانات يدوياً.'))}
  finally{setEmployeeOcrBusy(false)}
 }
 function startEmployeeForm(employee:EmployeeDisplay|null){setEditingEmployee(employee);setEmployeeName(employee?.full_name??'');setEmployeeTitle(employee?.job_title??'');setEmployeeDepartment(employee?.department??'');setEmployeePhone(employee?.phone??'');setEmployeeBirth(employee?.date_of_birth??'');setEmployeeNationality(employee?.nationality??'');setEmployeePassportNumber(employee?.passport_number??'');setEmployeePassportIssue(employee?.passport_issue_date??'');setEmployeePassportExpiry(employee?.passport_expiry_date??'');setEmployeePassport(null);setEmployeeProfilePhoto(null);setNewEmployeeAttachments([]);setEmployeeAttachments([]);setEmployeeError('');setEmployeeFormOpen(true)}
 async function addEmployee(e:FormEvent){
  e.preventDefault();const client=supabase;if(!client||!openedCompany||employeeSaving||employeeOcrBusy)return
  if(!employeeName.trim()){setEmployeeError(isEnglish?'Read a passport or enter the employee name.':'اقرأ الجواز أو أدخل اسم الموظف.');return}
  setEmployeeSaving(true);setEmployeeError('')
  const uploadedPaths:string[]=[]
  try{
   const payload={full_name:employeeName.trim(),job_title:employeeTitle.trim()||null,department:employeeDepartment.trim()||null,phone:employeePhone.trim()||null,date_of_birth:employeeBirth||null,nationality:employeeNationality.trim()||null,passport_number:employeePassportNumber.trim()||null,passport_issue_date:employeePassportIssue||null,passport_expiry_date:employeePassportExpiry||null}
   let employeeId=editingEmployee?.id
   if(editingEmployee){const updated=await client.from('company_employees').update(payload).eq('id',editingEmployee.id);if(updated.error)throw updated.error}
   else{const created=await client.from('company_employees').insert({...payload,company_id:openedCompany.id}).select('id').single();if(created.error)throw created.error;employeeId=created.data.id}
   if(!employeeId)throw new Error('Employee record was not created')
   const uploadTasks:Promise<void>[]=[]
   let nextPassportPath:string|null=null
   let nextProfilePhotoPath:string|null=null
   if(employeeProfilePhoto){const ext=employeeProfilePhoto.type==='image/png'?'png':'jpg';nextProfilePhotoPath=openedCompany.id+'/'+employeeId+'/profile/'+crypto.randomUUID()+'.'+ext;const path=nextProfilePhotoPath;uploadTasks.push((async()=>{const result=await client.storage.from('employee-passports').upload(path,employeeProfilePhoto,{contentType:employeeProfilePhoto.type,upsert:false});if(result.error)throw result.error;uploadedPaths.push(path)})())}
   if(employeePassport){
    const ext=employeePassport.name.split('.').pop()?.toLowerCase()||(employeePassport.type==='application/pdf'?'pdf':'jpg')
    nextPassportPath=openedCompany.id+'/'+employeeId+'/'+crypto.randomUUID()+'.'+ext
    const path=nextPassportPath
    uploadTasks.push((async()=>{const result=await client.storage.from('employee-passports').upload(path,employeePassport,{contentType:employeePassport.type,upsert:false});if(result.error)throw result.error;uploadedPaths.push(path)})())
   }
   const attachmentRows=newEmployeeAttachments.map(file=>{const ext=file.name.split('.').pop()?.toLowerCase()||'bin';return {file,path:openedCompany.id+'/'+employeeId+'/attachments/'+crypto.randomUUID()+'.'+ext}})
   for(const item of attachmentRows)uploadTasks.push((async()=>{const result=await client.storage.from('employee-passports').upload(item.path,item.file,{contentType:item.file.type||'application/octet-stream',upsert:false});if(result.error)throw result.error;uploadedPaths.push(item.path)})())
   const uploadResults=await Promise.allSettled(uploadTasks)
   const failedUpload=uploadResults.find(result=>result.status==='rejected')
   if(failedUpload?.status==='rejected')throw failedUpload.reason
   const dbTasks:Promise<void>[]=[]
   if(nextPassportPath)dbTasks.push((async()=>{const saved=await client.from('company_employees').update({passport_path:nextPassportPath}).eq('id',employeeId);if(saved.error)throw saved.error})())
   if(nextProfilePhotoPath)dbTasks.push((async()=>{const saved=await client.from('company_employees').update({profile_photo_path:nextProfilePhotoPath}).eq('id',employeeId);if(saved.error)throw saved.error})())
   if(attachmentRows.length)dbTasks.push((async()=>{const saved=await client.from('company_employee_attachments').insert(attachmentRows.map(({file,path})=>({employee_id:employeeId,file_name:file.name,file_path:path,mime_type:file.type||null,file_size:file.size})));if(saved.error)throw saved.error})())
   await Promise.all(dbTasks)
   if(nextPassportPath&&editingEmployee?.passport_path)void client.storage.from('employee-passports').remove([editingEmployee.passport_path])
   if(nextProfilePhotoPath&&editingEmployee?.profile_photo_path)void client.storage.from('employee-passports').remove([editingEmployee.profile_photo_path])
   const [passportSigned,photoSigned]=await Promise.all([nextPassportPath?client.storage.from('employee-passports').createSignedUrl(nextPassportPath,3600):Promise.resolve({data:null}),nextProfilePhotoPath?client.storage.from('employee-passports').createSignedUrl(nextProfilePhotoPath,3600):Promise.resolve({data:null})])
   const passportUrl=passportSigned.data?.signedUrl??editingEmployee?.passport_url??null
   const profilePhotoUrl=photoSigned.data?.signedUrl??employeeProfilePhotoPreview??editingEmployee?.profile_photo_url??null
   const savedEmployee:EmployeeDisplay={...(editingEmployee??{} as EmployeeDisplay),id:employeeId,company_id:openedCompany.id,...payload,employee_number:editingEmployee?.employee_number??null,email:editingEmployee?.email??null,passport_path:nextPassportPath??editingEmployee?.passport_path??null,profile_photo_path:nextProfilePhotoPath??editingEmployee?.profile_photo_path??null,created_at:editingEmployee?.created_at??new Date().toISOString(),passport_url:passportUrl,profile_photo_url:profilePhotoUrl}
   setEmployees(current=>[...current.filter(item=>item.id!==employeeId),savedEmployee].sort((a,b)=>a.full_name.localeCompare(b.full_name)))
   setEmployeeFormOpen(false);setEditingEmployee(null);setEmployeePassport(null);setEmployeeProfilePhoto(null);setNewEmployeeAttachments([]);setEmployeeAttachments([])
  }catch(err){
   if(uploadedPaths.length)await client.storage.from('employee-passports').remove(uploadedPaths)
   setEmployeeError(err instanceof Error?err.message:(isEnglish?'Could not save employee':'تعذر حفظ بيانات الموظف'))
  }finally{setEmployeeSaving(false)}
 }
 async function deleteEmployee(employee:CompanyEmployee){
  const client=supabase
  if(!client||!window.confirm(isEnglish?'Delete employee '+employee.full_name+'?':'تأكيد حذف الموظف '+employee.full_name+'؟'))return
  const result=await client.from('company_employees').delete().eq('id',employee.id)
  if(result.error){setEmployeeError(result.error.message);return}
  const paths=[employee.passport_path,employee.profile_photo_path].filter((path):path is string=>!!path);if(paths.length)await client.storage.from('employee-passports').remove(paths)
  setEmployees(current=>current.filter(item=>item.id!==employee.id))
 }

 const filteredCompanies=companies.filter(company=>[company.name,company.company_number,company.location].some(value=>value.toLocaleLowerCase().includes(companySearch.trim().toLocaleLowerCase())))

 if(selected?.id==='customers')return <section className="panel" style={{minHeight:360,padding:32}}>
  <button type="button" className="secondary-btn" onClick={()=>{setActiveApp(null);setCustomerSection(null);setOpenedCompany(null)}}><ArrowLeft size={16}/> Back to Travel Operations</button>
  <div className="panel-head" style={{alignItems:'flex-start',marginTop:28}}>
   <div><span className="eyebrow">CUSTOMERS / ORGANIZATION</span><h2 style={{fontSize:28,marginTop:10}}>Customers - Organization</h2><p style={{marginTop:8}}>إدارة الشركات والعملاء الأفراد خارج الشركات.</p></div>
   <div className="metric-icon tone-blue"><Building2 size={27}/></div>
  </div>
  {customerSection ? <div className="panel" style={{marginTop:28,padding:24,minHeight:180}}>
   {openedCompany ? <>
    <button type="button" className="secondary-btn" onClick={()=>{setOpenedCompany(null);setEmployees([]);setEmployeeFormOpen(false);setEmployeesSectionOpen(false);setEmployeeError('')}}><ArrowLeft size={15}/> رجوع إلى الشركات</button>
    <div style={{display:'flex',alignItems:'center',gap:22,flexWrap:'wrap',marginTop:26,padding:'24px 8px',borderBottom:'1px solid var(--border)'}}>
     <div style={{width:112,height:112,borderRadius:18,background:'#fff',border:'1px solid var(--border)',display:'grid',placeItems:'center',padding:12,flexShrink:0}}>
      {openedCompany.logo_url?<img src={openedCompany.logo_url} alt={'شعار '+openedCompany.name} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<Building2 size={48} color="var(--muted)"/>}
     </div>
     <div style={{flex:1,minWidth:220}}><span className="eyebrow">{isEnglish?'COMPANY PROFILE':'ملف الشركة'}</span><h2 style={{fontSize:26,margin:'8px 0'}}>{openedCompany.name}</h2><p style={{color:'var(--muted)',margin:0}}>{isEnglish?'Company number: ':'رقم الشركة: '}{openedCompany.company_number} · {openedCompany.location}</p></div>
     <button type="button" className="secondary-btn" onClick={()=>startCompanyForm(openedCompany)}><Settings2 size={16}/> {isEnglish?'Edit company details':'تعديل بيانات الشركة'}</button>
    </div>
    <button type="button" className="employee-section-card" onClick={()=>setEmployeesSectionOpen(true)}>
     <div className="employee-section-icon"><Users size={28}/></div><div className="employee-section-copy"><span className="eyebrow">{isEnglish?'COMPANY DIRECTORY':'دليل الشركة'}</span><h3>{isEnglish?'Employees':'الموظفون'}</h3><p>{isEnglish?'Manage employee profiles, contact details and passport documents.':'إدارة الملفات الشخصية للموظفين وبيانات التواصل ووثائق جوازات السفر.'}</p></div><div className="employee-section-count">{employees.length}</div><span className="employee-section-open">{isEnglish?'Open section':'فتح القسم'} <ArrowLeft size={16}/></span>
    </button>
    {employeesSectionOpen&&<div className="employee-section-content">
     <div className="panel-head" style={{marginTop:24,alignItems:'center',gap:12,flexWrap:'wrap'}}><div><h3 style={{fontSize:22}}>{isEnglish?'Employees':'الموظفون'}</h3><p style={{color:'var(--muted)',marginTop:6}}>{isEnglish?'Employee profiles registered under this company.':'الملفات الشخصية المسجلة ضمن هذه الشركة.'}</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="secondary-btn" onClick={()=>setEmployeesSectionOpen(false)}>{isEnglish?'Back':'رجوع'}</button><button type="button" className="primary-btn" onClick={()=>startEmployeeForm(null)}><Plus size={16}/>{isEnglish?'Add employee':'إضافة موظف'}</button></div></div>
    {employeeError&&<div className="error-line" style={{marginTop:14}}>{employeeError}</div>}
    {employeesLoading?<div className="loading-card" style={{marginTop:18}}>{isEnglish?'Loading employees...':'جارٍ تحميل الموظفين...'}</div>:employees.length?<div className="employee-directory-grid" style={{marginTop:18}}>
     {employees.map(employee=><article key={employee.id} className="employee-directory-card"><div className="employee-card-top"><div className="employee-avatar">{employee.profile_photo_url?<img src={employee.profile_photo_url} alt={employee.full_name}/>:employee.full_name.trim().charAt(0).toUpperCase()}</div><div className="employee-card-identity"><h3 className="employee-directory-name">{employee.full_name}</h3><span className="employee-directory-role">{employee.job_title||(isEnglish?'Job title not specified':'المسمى الوظيفي غير محدد')}</span></div></div><div className="employee-card-details"><div><span>{isEnglish?'Department':'القسم'}</span><b>{employee.department||'—'}</b></div><div><span>{isEnglish?'Phone':'رقم الهاتف'}</span><b dir="ltr">{employee.phone||'—'}</b></div><div><span>{isEnglish?'Passport':'جواز السفر'}</span><b dir="ltr">{employee.passport_number||'—'}</b></div></div><div className="employee-directory-actions"><button type="button" className="secondary-btn" onClick={()=>startEmployeeForm(employee)}><Settings2 size={15}/>{isEnglish?'Edit':'تعديل'}</button><button type="button" className="primary-btn" onClick={()=>startEmployeeForm(employee)}>{isEnglish?'Open profile':'فتح الملف'} <ArrowLeft size={15}/></button><button type="button" className="icon-btn" title={isEnglish?'Delete employee':'حذف الموظف'} onClick={()=>void deleteEmployee(employee)}><Trash2 size={15}/></button></div></article>)}
    </div>:<div className="empty-state" style={{marginTop:18,padding:28}}><Users size={28}/><b>{isEnglish?'No employees registered':'لا يوجد موظفون مسجلون'}</b><span>{isEnglish?'Open the Employees section to add the first employee.':'ادخل إلى قسم الموظفين لإضافة أول موظف.'}</span></div>}
    {employeeFormOpen&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!employeeSaving)setEmployeeFormOpen(false)}}><form className="modal-card employee-profile-modal" onSubmit={addEmployee} style={{maxWidth:1100}}>
     <div className="modal-head"><div><span className="eyebrow">{isEnglish?'EMPLOYEE PROFILE':'الملف الشخصي للموظف'}</span><h2>{editingEmployee?(isEnglish?'Edit employee':'تعديل بيانات الموظف'):(isEnglish?'Add employee':'إضافة موظف')}</h2><p>{isEnglish?'Employee record for ':'ملف الموظف التابع لشركة '}{openedCompany.name}</p></div><button type="button" className="icon-btn" onClick={()=>setEmployeeFormOpen(false)} disabled={employeeSaving||employeeOcrBusy}><X/></button></div>
     <div className="employee-profile-layout" dir="ltr">
      <aside className="employee-passport-column" dir={isEnglish?'ltr':'rtl'}>
       <div className="employee-document-heading"><b>{isEnglish?'Passport':'جواز السفر'}</b><span>{isEnglish?'Main identification document':'وثيقة الهوية الرئيسية'}</span></div>
       <div className="employee-passport-preview employee-passport-preview-large">
        {(employeePassport?.type==='application/pdf'||(!employeePassport&&editingEmployee?.passport_url?.toLowerCase().includes('.pdf')))?(employeePassportPreview?<iframe title={isEnglish?'Passport preview':'معاينة جواز السفر'} src={employeePassportPreview}/>:editingEmployee?.passport_url?<iframe title={isEnglish?'Passport preview':'معاينة جواز السفر'} src={editingEmployee.passport_url}/>:<div className="employee-document-empty"><FileText size={34}/><span>{isEnglish?'No passport uploaded':'لم يتم إرفاق جواز السفر'}</span></div>):(employeePassportPreview||editingEmployee?.passport_url)?<img src={employeePassportPreview||editingEmployee?.passport_url||''} alt={isEnglish?'Passport preview':'معاينة جواز السفر'}/>:<div className="employee-document-empty"><FileImage size={34}/><span>{isEnglish?'Passport preview will appear here':'ستظهر معاينة الجواز هنا'}</span></div>}
       </div>
       <label className="employee-file-picker"><Upload size={16}/>{isEnglish?'Upload / Replace passport':'رفع / استبدال الجواز'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>{const file=e.target.files?.[0]??null;e.currentTarget.value='';if(!file)return;if(file.size>10*1024*1024){setEmployeeError(isEnglish?'File must not exceed 10 MB':'يجب ألا يتجاوز حجم الملف 10 MB');return}setEmployeeError('');setEmployeePassport(file);void readEmployeePassport(file)}} disabled={employeeSaving||employeeOcrBusy}/></label>
       <small className="employee-file-hint">{isEnglish?'PDF, JPG, PNG or WEBP · Max 10 MB':'PDF أو JPG أو PNG أو WEBP · الحد الأقصى 10 MB'}</small>{employeeOcrBusy&&<small className="employee-ocr-status">{isEnglish?'Gemini is reading the passport...':'Gemini دا يقرأ بيانات الجواز...'}</small>}
      </aside>
      <div className="employee-profile-fields" dir={isEnglish?'ltr':'rtl'}>
       <section className="employee-photo-editor"><div className="employee-photo-editor-preview">{employeeProfilePhotoPreview||editingEmployee?.profile_photo_url?<img src={employeeProfilePhotoPreview||editingEmployee?.profile_photo_url||''} alt={isEnglish?'Employee profile photo':'صورة الموظف'}/>:<Users size={30}/>}</div><div><b>{isEnglish?'Employee profile photo':'صورة الموظف الشخصية'}</b><span>{isEnglish?'Automatically cropped from the passport photo when available.':'تُستخرج تلقائياً من صورة الجواز عند توفرها.'}</span><label className="employee-photo-upload">{isEnglish?'Upload / Replace photo':'رفع / استبدال الصورة'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0]??null;e.currentTarget.value='';if(!file)return;if(file.size>5*1024*1024){setEmployeeError(isEnglish?'Profile photo must not exceed 5 MB':'يجب ألا تتجاوز صورة الموظف 5 MB');return}setEmployeeProfilePhoto(file)}} disabled={employeeSaving||employeeOcrBusy}/></label></div></section>
       <div className="employee-form-grid">
        <label>{isEnglish?'Full name':'الاسم الكامل'}<input dir="auto" value={employeeName} onChange={e=>setEmployeeName(e.target.value)} required maxLength={160}/></label>
        <label>{isEnglish?'Job title':'المسمى الوظيفي'}<input dir="auto" value={employeeTitle} onChange={e=>setEmployeeTitle(e.target.value)} maxLength={120}/></label>
        <label>{isEnglish?'Department':'القسم'}<input dir="auto" value={employeeDepartment} onChange={e=>setEmployeeDepartment(e.target.value)} maxLength={120}/></label>
        <label>{isEnglish?'Phone number':'رقم الهاتف'}<input dir="ltr" value={employeePhone} onChange={e=>setEmployeePhone(e.target.value)} maxLength={50}/></label>
        <label>{isEnglish?'Date of birth':'تاريخ الميلاد'}<input dir="ltr" type="date" value={employeeBirth} onChange={e=>setEmployeeBirth(e.target.value)}/></label>
        <label>{isEnglish?'Nationality':'الجنسية'}<input dir="auto" value={employeeNationality} onChange={e=>setEmployeeNationality(e.target.value)} maxLength={100}/></label>
        <label>{isEnglish?'Passport number':'رقم جواز السفر'}<input dir="ltr" value={employeePassportNumber} onChange={e=>setEmployeePassportNumber(e.target.value)} maxLength={80}/></label>
        <label>{isEnglish?'Passport issue date':'تاريخ إصدار الجواز'}<input dir="ltr" type="date" value={employeePassportIssue} onChange={e=>setEmployeePassportIssue(e.target.value)}/></label>
        <label>{isEnglish?'Passport expiry date':'تاريخ انتهاء الجواز'}<input dir="ltr" type="date" value={employeePassportExpiry} onChange={e=>setEmployeePassportExpiry(e.target.value)}/></label>
       </div>
       <section className="employee-attachments-section">
        <div className="employee-attachments-heading"><div><b>{isEnglish?'Additional attachments':'مرفقات إضافية'}</b><span>{isEnglish?'Upload contracts, certificates, ID cards and other documents.':'أرفق العقود والشهادات والهويات وأي مستندات أخرى.'}</span></div><label className="employee-attachment-add"><Plus size={15}/>{isEnglish?'Add files':'إضافة مرفقات'}<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx" onChange={e=>{const files=Array.from(e.target.files??[]);const oversized=files.find(file=>file.size>15*1024*1024);if(oversized){setEmployeeError(isEnglish?'Each attachment must be 15 MB or less':'يجب ألا يتجاوز حجم كل مرفق 15 MB');e.currentTarget.value='';return}setEmployeeError('');setNewEmployeeAttachments(current=>[...current,...files]);e.currentTarget.value=''}} disabled={employeeSaving}/></label></div>
        {attachmentsLoading?<p className="employee-file-hint">{isEnglish?'Loading attachments...':'جارٍ تحميل المرفقات...'}</p>:null}
        {(employeeAttachments.length>0||newEmployeeAttachments.length>0)?<div className="employee-attachments-list">
         {employeeAttachments.map(file=><div className="employee-attachment-item" key={file.id}><FileText size={19}/><div className="employee-attachment-info"><b>{file.file_name}</b><small>{file.file_size?Math.max(1,Math.round(file.file_size/1024))+' KB':''}</small></div>{file.file_url&&<a href={file.file_url} target="_blank" rel="noreferrer" className="employee-attachment-open">{isEnglish?'Preview':'معاينة'} <ExternalLink size={14}/></a>}<button type="button" className="icon-btn" title={isEnglish?'Remove attachment':'حذف المرفق'} onClick={async()=>{const client=supabase;if(!client||!window.confirm(isEnglish?'Remove this attachment?':'هل تريد حذف هذا المرفق؟'))return;const removed=await client.from('company_employee_attachments').delete().eq('id',file.id);if(removed.error){setEmployeeError(removed.error.message);return}await client.storage.from('employee-passports').remove([file.file_path]);setEmployeeAttachments(current=>current.filter(item=>item.id!==file.id))}}><Trash2 size={14}/></button></div>)}
         {newEmployeeAttachments.map((file,index)=><div className="employee-attachment-item pending" key={file.name+'-'+index}><FileText size={19}/><div className="employee-attachment-info"><b>{file.name}</b><small>{Math.max(1,Math.round(file.size/1024))} KB · {isEnglish?'Pending upload':'بانتظار الرفع'}</small></div><button type="button" className="icon-btn" title={isEnglish?'Remove file':'إزالة الملف'} onClick={()=>setNewEmployeeAttachments(current=>current.filter((_,i)=>i!==index))}><X size={15}/></button></div>)}
        </div>:<div className="employee-attachments-empty">{isEnglish?'No additional attachments yet.':'لا توجد مرفقات إضافية حالياً.'}</div>}
       </section>
      </div>
     </div>
     {employeeError&&<div className="error-line" style={{marginTop:14}}>{employeeError}</div>}
     <div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setEmployeeFormOpen(false)} disabled={employeeSaving}>{isEnglish?'Cancel':'إلغاء'}</button><button type="submit" className="primary-btn" disabled={employeeSaving||employeeOcrBusy}>{employeeSaving?(isEnglish?'Saving...':'جارٍ الحفظ...'):(editingEmployee?(isEnglish?'Save changes':'حفظ التعديلات'):(isEnglish?'Save employee':'حفظ الموظف'))}<Plus size={16}/></button></div>
    </form></div>}
    </div>}
   </> : <>
    <button type="button" className="secondary-btn" onClick={()=>{setCustomerSection(null);setShowCompanyForm(false)}}><ArrowLeft size={15}/> رجوع إلى الأقسام</button>
    {customerSection==='companies' ? <>
     <div className="panel-head" style={{marginTop:24,alignItems:'center',gap:16,flexWrap:'wrap'}}>
      <div><h3 style={{fontSize:24}}>الشركات</h3><p style={{color:'var(--muted)',marginTop:6}}>دليل الشركات والمؤسسات المسجلة.</p></div>
      <button type="button" className="primary-btn" onClick={()=>startCompanyForm(null)}><Plus size={17}/> إضافة شركة</button>
     </div>
     <div className="company-search-wrap">
      <Search size={19} className="company-search-icon"/>
      <input className="company-search-input" aria-label="بحث عن شركة" value={companySearch} onChange={e=>setCompanySearch(e.target.value)} placeholder="ابحث باسم الشركة أو رقمها أو موقعها..."/>
      {companySearch&&<button type="button" className="company-search-clear" onClick={()=>setCompanySearch('')} aria-label="مسح البحث"><X size={16}/></button>}
     </div>
     {companyNotice&&<div className="success-line" style={{marginTop:14}}>{companyNotice}</div>}
     {companyError&&<div className="error-line" style={{marginTop:14}}>{companyError}</div>}
     {companiesLoading?<div className="loading-card" style={{marginTop:20}}>جارٍ تحميل الشركات...</div>:
      filteredCompanies.length?<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',gap:18,marginTop:22}}>
       {filteredCompanies.map(company=><article className="company-directory-card" key={company.id}>
        <div className="company-directory-logo">{company.logo_url?<img src={company.logo_url} alt={'شعار '+company.name}/>:<Building2 size={54} strokeWidth={1.35}/>}</div>
        <h3 className="company-directory-name">{company.name}</h3>
        <div className="company-directory-meta">رقم الشركة: {company.company_number}</div>
        <div className="company-directory-meta"><MapPin size={14}/>{company.location}</div>
        <div className="company-directory-actions">
         <button type="button" className="secondary-btn" onClick={()=>startCompanyForm(company)}><Settings2 size={15}/> تعديل البيانات</button>
         <button type="button" className="primary-btn" onClick={()=>{setOpenedCompany(company);setEmployeesSectionOpen(false);setEmployeeError('')}}>فتح الشركة <ArrowLeft size={15}/></button>
        </div>
       </article>)}
      </div>:<div className="empty-state" style={{marginTop:20,padding:28}}><Building2 size={28}/><b>{companySearch?'لا توجد نتائج مطابقة':'لا توجد شركات مسجلة بعد'}</b><span>{companySearch?'جرّب البحث باسم أو رقم أو موقع مختلف.':'اضغط على إضافة شركة حتى تسجل أول شركة في الدليل.'}</span></div>}
     {showCompanyForm&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!companySaving)setShowCompanyForm(false)}}><form className="modal-card" onSubmit={saveCompany} style={{maxWidth:560}}>
      <div className="modal-head"><div><span className="eyebrow">COMPANY DIRECTORY</span><h2>{editingCompany?'تعديل بيانات الشركة':'إضافة شركة'}</h2><p>أدخل بيانات الشركة وارفع شعارها إن توفر.</p></div><button type="button" className="icon-btn" onClick={()=>setShowCompanyForm(false)} disabled={companySaving}><X/></button></div>
      <label>اسم الشركة<input value={companyName} onChange={e=>setCompanyName(e.target.value)} required maxLength={160} placeholder="اسم الشركة"/></label>
      <label style={{marginTop:14}}>رقم الشركة<input value={companyNumber} onChange={e=>setCompanyNumber(e.target.value)} required maxLength={80} placeholder="رقم الشركة"/></label>
      <label style={{marginTop:14}}>موقع الشركة<input value={companyLocation} onChange={e=>setCompanyLocation(e.target.value)} required maxLength={240} placeholder="المدينة أو العنوان"/></label>
      <div style={{marginTop:16}}><label>لوكو الشركة <span style={{color:'var(--muted)',fontWeight:400}}>PNG / JPG / WEBP / SVG · حتى 5 MB</span></label><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e=>{const file=e.target.files?.[0]??null;if(file&&file.size>5*1024*1024){setCompanyError('حجم الشعار يجب ألا يتجاوز 5 MB.');e.currentTarget.value='';return}setCompanyError('');setCompanyLogo(file)}} disabled={companySaving}/>{companyLogoPreview&&<img src={companyLogoPreview} alt="معاينة شعار الشركة" style={{display:'block',width:100,height:100,objectFit:'contain',marginTop:12,border:'1px solid var(--border)',borderRadius:12,padding:8}}/>}{!companyLogoPreview&&editingCompany?.logo_url&&<img src={editingCompany.logo_url} alt="شعار الشركة الحالي" style={{display:'block',width:100,height:100,objectFit:'contain',marginTop:12,border:'1px solid var(--border)',borderRadius:12,padding:8}}/>}</div>
      {companyError&&<div className="error-line" style={{marginTop:14}}>{companyError}</div>}
      <div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setShowCompanyForm(false)} disabled={companySaving}>إلغاء</button><button type="submit" className="primary-btn" disabled={companySaving}>{companySaving?'جارٍ الحفظ...':editingCompany?'حفظ التعديلات':'حفظ الشركة'}<Plus size={16}/></button></div>
     </form></div>}
    </> : <>
     <h3 style={{fontSize:22,marginTop:22}}>العملاء خارج الشركات</h3>
     <p style={{color:'var(--muted)',marginTop:8}}>قسم إدارة العملاء الأفراد غير المرتبطين بشركات.</p>
     <div className="empty-state" style={{marginTop:24,padding:24}}><Users size={26}/><b>العملاء خارج الشركات</b><span>تم فتح القسم. يمكن إضافة سجلّات وبيانات العملاء في الخطوة التالية.</span></div>
    </>}
   </>}
  </div> : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:18,marginTop:30}}>
   <button type="button" className="panel" onClick={()=>setCustomerSection('companies')} style={{textAlign:'start',padding:26,cursor:'pointer',minHeight:170,display:'flex',flexDirection:'column',alignItems:'flex-start',gap:14}}>
    <div className="metric-icon tone-blue"><Building2 size={27}/></div><b style={{fontSize:20}}>الشركات</b><span style={{color:'var(--muted)',fontSize:13}}>إدارة الشركات والمؤسسات.</span><span className="text-btn" style={{marginTop:'auto'}}>فتح القسم <ArrowLeft size={14}/></span>
   </button>
   <button type="button" className="panel" onClick={()=>setCustomerSection('individuals')} style={{textAlign:'start',padding:26,cursor:'pointer',minHeight:170,display:'flex',flexDirection:'column',alignItems:'flex-start',gap:14}}>
    <div className="metric-icon tone-blue"><Users size={27}/></div><b style={{fontSize:20}}>العملاء خارج الشركات</b><span style={{color:'var(--muted)',fontSize:13}}>إدارة العملاء الأفراد بشكل مستقل.</span><span className="text-btn" style={{marginTop:'auto'}}>فتح القسم <ArrowLeft size={14}/></span>
   </button>
  </div>}
 </section>
 if(selected)return <section className="panel" style={{minHeight:360,padding:32}}>
  <button type="button" className="secondary-btn" onClick={()=>setActiveApp(null)}><ArrowLeft size={16}/> Back to Travel Operations</button>
  <div className="panel-head" style={{alignItems:'flex-start',marginTop:28}}>
   <div><span className="eyebrow">{selected.code}</span><h2 style={{fontSize:28,marginTop:10}}>{selected.title}</h2><p style={{marginTop:8}}>{selected.description}</p></div>
   <div className="metric-icon tone-blue">{selected.icon}</div>
  </div>
  <div className="empty-state" style={{marginTop:34,padding:32}}><div className="metric-icon tone-blue">{selected.icon}</div><b>{selected.title}</b><span>تم فتح مساحة التطبيق. الواجهة الأساسية جاهزة، ويمكن إضافة وظائفه وربطه ببيانات النظام بالخطوة التالية.</span></div>
 </section>
 return <section className="panel" style={{minHeight:360,padding:32}}>
  <div className="panel-head" style={{alignItems:'flex-start'}}>
   <div><span className="eyebrow">BLUE LINE TRAVEL / OPERATIONS</span><h2 style={{fontSize:28,marginTop:10}}>Travel Operations</h2><p style={{marginTop:8}}>اختر التطبيق الذي تريد العمل عليه.</p></div>
   <div className="metric-icon tone-blue"><Plane size={22}/></div>
  </div>
  <div className="travel-app-grid" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:18,marginTop:30}}>
   {apps.map(app=><button key={app.id} type="button" onClick={()=>setActiveApp(app.id)} className="panel travel-app-card" style={{textAlign:'start',padding:24,cursor:'pointer',minHeight:190,display:'flex',flexDirection:'column',alignItems:'flex-start',gap:14}}>
    <div className="metric-icon tone-blue">{app.icon}</div><b style={{fontSize:18}}>{app.title}</b><span style={{color:'var(--muted)',lineHeight:1.7,fontSize:13}}>{app.description}</span><span className="text-btn" style={{marginTop:'auto'}}>Open app <ArrowLeft size={14}/></span>
   </button>)}
  </div>
 </section>
}
