import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Activity, ArrowLeft, Bell, BriefcaseBusiness, CalendarClock, CheckCircle2, ChevronDown, CircleAlert, FileText, LayoutDashboard, LogOut, Menu, Plus, Search, Settings2, ShieldCheck, Trash2, Users, WalletCards, X, Plane, Trees, Luggage, Compass, MapPin, Globe2 } from 'lucide-react'
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
  const [view, setView] = useState<'overview' | 'cases' | 'documents' | 'settings'>('overview')
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
    <aside className={`sidebar ${mobileNav?'sidebar-open':''}`}><Brand/><div className="workspace"><span className="workspace-dot"/><div><b>Blue Line Travel</b><small>Visa Operations</small></div><ChevronDown size={15}/></div><div className="nav-label">القائمة الرئيسية</div><button className={view==='overview'?'nav-item active':'nav-item'} onClick={()=>{setView('overview');setMobileNav(false)}}><LayoutDashboard size={18}/>نظرة عامة</button><button className={view==='cases'?'nav-item active':'nav-item'} onClick={()=>{setView('cases');setMobileNav(false)}}><BriefcaseBusiness size={18}/>VISA<span className="nav-count">{cases.length}</span></button><button className={view==='documents'?'nav-item active':'nav-item'} onClick={()=>{setView('documents');setMobileNav(false)}}><FileText size={18}/>الوثائق</button><div className="nav-label nav-label-spaced">الإدارة</div><div className="nav-item muted"><Users size={18}/>الموظفون</div><div className="nav-item muted"><WalletCards size={18}/>الحسابات</div>{(role==='manager'||role==='admin') && <button className={view==='settings'?'nav-item active':'nav-item'} onClick={()=>{setView('settings');setMobileNav(false)}}><Settings2 size={18}/>إعدادات النظام</button>}<div className="sidebar-bottom"><div className="profile-chip"><div className="avatar">{displayName.slice(0,1)}</div><div><b>{displayName}</b><small>{role==='admin'?'مدير النظام':role==='manager'?'مدير':'موظف'}</small></div><button onClick={signOut} title="تسجيل الخروج"><LogOut size={17}/></button></div><small className="version">BLUE LINE / INTERNAL SYSTEM</small></div></aside>
    {mobileNav && <button className="scrim" onClick={()=>setMobileNav(false)} aria-label="إغلاق القائمة"/>}
    <main className="main-area"><header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setMobileNav(true)}><Menu/></button><div className="breadcrumb">العمليات <span>/</span> {view==='overview'?'نظرة عامة':'المعاملات'}</div><div className="top-actions"><button className="language-toggle" onClick={toggleLanguage} type="button" aria-label="Switch language">{isEnglish ? 'العربية' : 'English'}</button><span className="today">{new Intl.DateTimeFormat(isEnglish ? 'en-GB' : 'ar-IQ',{dateStyle:'full'}).format(new Date())}</span><button className="icon-btn" title="الإشعارات"><Bell size={18}/><i/></button><div className="top-avatar">{displayName.slice(0,1)}</div></div></header>
      <div className="page-content">
      {error && <div className="error-banner"><CircleAlert size={17}/>{error}</div>}
      {loading ? <div className="loading-card">جارٍ تحميل بيانات النظام...</div> : <>
        {view==='overview' && <section className="metrics-grid"><Metric icon={<BriefcaseBusiness/>} label="إجمالي المعاملات" value={cases.length} note="كل الملفات المسجلة" tone="blue"/><Metric icon={<Activity/>} label="قيد الإجراء" value={openCases.length} note="معاملات مفتوحة حالياً" tone="violet"/><Metric icon={<CalendarClock/>} label="متجاوزة الموعد" value={overdue} note="تحتاج إلى متابعة" tone="orange"/><Metric icon={<CheckCircle2/>} label="مكتملة" value={cases.filter(c=>c.status==='completed').length} note="تم إنهاء إجراءاتها" tone="green"/></section>}
        {view==='settings' ? <SettingsPanel/> : view==='documents' ? <DocumentsWorkspace cases={cases} userId={session.user.id}/> : view==='overview' ? <section className="content-grid"><div className="panel"><div className="panel-head"><div><h2>آخر المعاملات</h2><p>أحدث الملفات التي تم إنشاؤها</p></div><button className="text-btn" onClick={()=>setView('cases')}>عرض الكل <ArrowLeft size={15}/></button></div><CaseTable rows={cases.slice(0,6)}/></div><div className="panel stages-panel"><div className="panel-head"><div><h2>{isEnglish ? 'Cases distribution' : 'توزيع المعاملات'}</h2><p>{isEnglish ? 'Number of cases in each pipeline' : 'عدد الملفات داخل كل Pipeline'}</p></div><BriefcaseBusiness size={19}/></div>{pipelines.length ? pipelines.map((pipeline,i)=><div className="pipeline-summary-row" key={pipeline.id}><span className="pipeline-summary-dot" style={{background:pipelineColors[i % pipelineColors.length]}}/><span>{pipeline.name}</span><b>{cases.filter(c=>c.pipeline_id===pipeline.id).length}</b></div>) : <div className="pipeline-summary-note">أضف Pipeline حتى تظهر هنا.</div>}</div></section> : <PipelineBoard pipelines={pipelines} rows={filteredCases} query={query} onQueryChange={setQuery} canManage={role==='manager'||role==='admin'} onCreate={createPipeline} onMove={moveCaseToPipeline} onDelete={deletePipeline} onOpen={setSelectedCase} onAddCase={()=>setShowNew(true)}/>}
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
