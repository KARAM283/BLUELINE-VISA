import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Bot, RefreshCw, ShieldCheck, Zap } from 'lucide-react'
import { supabase } from './lib/supabase'

type Country = { id: string; name: string; iso2: string | null }
type Visa = { id: string; country_id: string; name: string }
type Pipeline = { id: string; name: string }

export default function SettingsPanel() {
  const [countries, setCountries] = useState<Country[]>([])
  const [visas, setVisas] = useState<Visa[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [countryName, setCountryName] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [visaName, setVisaName] = useState('')
  const [visaCountry, setVisaCountry] = useState('')
  const [pipelineName, setPipelineName] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function load() {
    if (!supabase) return
    const [c, v, p] = await Promise.all([
      supabase.from('countries').select('id,name,iso2').order('name'),
      supabase.from('visa_types').select('id,country_id,name').order('name'),
      supabase.from('visa_pipelines').select('id,name').eq('is_active', true).order('created_at')
    ])
    const issue = c.error || v.error || p.error
    if (issue) { setError(issue.message); return }
    setCountries(c.data ?? []); setVisas(v.data ?? []); setPipelines(p.data ?? [])
  }
  useEffect(() => { void load() }, [])

  async function save(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true); setError(''); setNotice('')
    const result = await action()
    if (result.error) setError(result.error.message)
    else { setNotice('تم الحفظ بنجاح'); await load() }
    setBusy(false)
  }

  const field: CSSProperties = { border: '1px solid #e2e7ef', borderRadius: 8, padding: '10px 11px', minWidth: 0, background: '#fbfcfe', color: '#24334a', font: 'inherit', fontSize: 12 }
  const form: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 9, marginBottom: 16 }
  const card: CSSProperties = { background: '#fff', border: '1px solid #e9edf3', borderRadius: 12, padding: 17, marginBottom: 14 }
  const button: CSSProperties = { border: 0, borderRadius: 8, padding: '10px 14px', background: '#172943', color: '#fff', fontSize: 11, fontWeight: 600 }
  const heading: CSSProperties = { margin: '0 0 12px', fontSize: 14, color: '#1e2b40' }

  return <div>
    <GeminiAISettings />
    {notice && <div style={{ ...card, color: '#21865e', background: '#effaf4', fontSize: 11 }}>{notice}</div>}
    {error && <div className="error-banner">{error}</div>}
    <section style={card}>
      <h2 style={heading}>الدول</h2>
      <form style={form} onSubmit={e => { e.preventDefault(); void save(() => supabase!.from('countries').insert({ name: countryName.trim(), iso2: countryCode.trim().toUpperCase() || null })) }}>
        <input style={field} placeholder="اسم الدولة" value={countryName} onChange={e => setCountryName(e.target.value)} required />
        <input style={field} placeholder="ISO2 (اختياري)" maxLength={2} value={countryCode} onChange={e => setCountryCode(e.target.value)} />
        <button style={button} disabled={busy}>إضافة دولة</button>
      </form>
      <div style={{ fontSize: 11, color: '#647187' }}>{countries.length ? countries.map(x => x.name).join(' · ') : 'لا توجد دول مضافة بعد'}</div>
    </section>
    <section style={card}>
      <h2 style={heading}>أنواع التأشيرات</h2>
      <form style={form} onSubmit={e => { e.preventDefault(); void save(() => supabase!.from('visa_types').insert({ name: visaName.trim(), country_id: visaCountry })) }}>
        <select style={field} value={visaCountry} onChange={e => setVisaCountry(e.target.value)} required><option value="">اختر الدولة</option>{countries.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <input style={field} placeholder="مثال: سياحية / عمل / دراسة" value={visaName} onChange={e => setVisaName(e.target.value)} required />
        <button style={button} disabled={busy || !countries.length}>إضافة نوع</button>
      </form>
      <div style={{ fontSize: 11, color: '#647187' }}>{visas.length ? visas.map(x => `${countries.find(c => c.id === x.country_id)?.name ?? '—'}: ${x.name}`).join(' · ') : 'لا توجد أنواع تأشيرات'}</div>
    </section>
    <section style={card}>
      <h2 style={heading}>Pipelines</h2>
      <form style={form} onSubmit={e => { e.preventDefault(); void save(() => supabase!.rpc('create_visa_pipeline', { p_name: pipelineName.trim() })) }}>
        <input style={field} placeholder="اسم Pipeline" value={pipelineName} onChange={e => setPipelineName(e.target.value)} required />
        <button style={button} disabled={busy}>إضافة Pipeline</button>
      </form>
      <div style={{ fontSize: 11, color: '#647187' }}>{pipelines.length ? pipelines.map(x => x.name).join(' · ') : 'لا توجد Pipelines'}</div>
    </section>
  </div>
}

function GeminiAISettings() {
  const [apiKey,setApiKey]=useState('')
  const [model,setModel]=useState('gemini-3.5-flash-lite')
  const [models,setModels]=useState<{name:string;displayName:string}[]>([])
  const [configured,setConfigured]=useState(false)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [error,setError]=useState('')
  async function invoke(body:Record<string,unknown>) {
    if(!supabase)throw new Error('Supabase غير متصل')
    const {data,error}=await supabase.functions.invoke('passport-ocr',{body})
    if(error){
      let detail=error.message||'فشل الاتصال بالخدمة'
      const context=(error as {context?:unknown}).context
      if(context instanceof Response){try{const j=await context.clone().json();if(j?.error)detail=String(j.error)}catch{}}
      throw new Error(detail)
    }
    if(data?.error)throw new Error(data.error)
    return data
  }
  useEffect(()=>{let active=true;(async()=>{try{const d=await invoke({action:'config'});if(active){setConfigured(!!d.configured);setModel(d.model||'gemini-3.5-flash-lite')}}catch(e){if(active)setError(e instanceof Error?e.message:'تعذر تحميل الإعدادات')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[])
  async function refreshModels(){
    setBusy(true);setError('');setMessage('')
    try{const d=await invoke({action:'models',apiKey});setModels(d.models||[]);if(!(d.models||[]).some((x:{name:string})=>x.name===model)&&d.models?.length)setModel(d.models[0].name);setMessage('تم الاتصال بـ Gemini وجلب '+(d.models?.length||0)+' موديل متاح.')}
    catch(e){setError(e instanceof Error?e.message:'تعذر جلب الموديلات')}
    finally{setBusy(false)}
  }
  async function save(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');setMessage('')
    try{const d=await invoke({action:'save',apiKey,model});setConfigured(true);setApiKey('');setMessage('تم حفظ إعدادات Gemini بنجاح. الموديل النشط: '+d.model)}
    catch(e){setError(e instanceof Error?e.message:'تعذر حفظ الإعدادات')}
    finally{setBusy(false)}
  }
  const card:CSSProperties={background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:18,marginBottom:16}
  const field:CSSProperties={width:'100%',border:'1px solid #dbe2ec',borderRadius:9,padding:'11px 12px',background:'#fbfcfe',color:'#24334a',font:'inherit',fontSize:12,minWidth:0}
  const btn:CSSProperties={border:0,borderRadius:9,padding:'10px 14px',background:'#172943',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:7}
  return <section style={card}>
    <div style={{display:'flex',alignItems:'center',gap:11,marginBottom:8}}>
      <div style={{width:40,height:40,borderRadius:11,background:'#f0edff',color:'#6c63ff',display:'grid',placeItems:'center'}}><Bot size={21}/></div>
      <div style={{flex:1}}><h2 style={{margin:0,fontSize:15,color:'#1e2b40'}}>Gemini AI · إعدادات الذكاء الاصطناعي</h2><p style={{margin:'4px 0 0',fontSize:11,color:'#7b8798'}}>إدارة مفتاح API واختيار موديل قراءة الجوازات</p></div>
      <span style={{fontSize:10,padding:'5px 9px',borderRadius:20,background:configured?'#eaf8f0':'#fff4e8',color:configured?'#21865e':'#b7791f'}}>{configured?'متصل':'غير مضبوط'}</span>
    </div>
    {loading?<p style={{fontSize:11,color:'#778399'}}>جارٍ تحميل إعدادات Gemini...</p>:<form onSubmit={save} style={{display:'grid',gap:12,marginTop:16}}>
      <label style={{display:'grid',gap:6,fontSize:11,color:'#526176'}}>Gemini API Key
        <input style={field} type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder={configured?'مفتاح محفوظ — اكتب مفتاحاً جديداً للاستبدال':'ألصق Gemini API Key هنا'} autoComplete="new-password"/>
      </label>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:8,alignItems:'end'}}>
        <label style={{display:'grid',gap:6,fontSize:11,color:'#526176'}}>الموديل النشط
          <select style={field} value={model} onChange={e=>setModel(e.target.value)}>
            {(models.length?models:[{name:model,displayName:model},{name:'gemini-3.5-flash-lite',displayName:'Gemini 3.5 Flash-Lite (سريع واقتصادي)'},{name:'gemini-3.8-flash',displayName:'Gemini 3.8 Flash'}]).map(x=><option key={x.name} value={x.name}>{x.displayName} · {x.name}</option>)}
          </select>
        </label>
        <button type="button" style={{...btn,background:'#eef2f8',color:'#34445d'}} disabled={busy||(!apiKey&&!configured)} onClick={()=>void refreshModels()}><RefreshCw size={14}/> جلب الموديلات</button>
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <button style={btn} disabled={busy||(!apiKey&&!configured)}><Zap size={14}/>{busy?'جارٍ الحفظ والاختبار...':'اختبار الاتصال وحفظ الإعدادات'}</button>
        <span style={{fontSize:10,color:'#8793a5',display:'inline-flex',alignItems:'center',gap:5}}><ShieldCheck size={13}/> المفتاح محفوظ على السيرفر ولا يظهر للموظفين.</span>
      </div>
    </form>}
    {message&&<div style={{marginTop:12,padding:10,borderRadius:8,background:'#effaf4',color:'#21865e',fontSize:11}}>{message}</div>}
    {error&&<div style={{marginTop:12,padding:10,borderRadius:8,background:'#fff1f0',color:'#b42318',fontSize:11}}>{error}</div>}
  </section>
}
