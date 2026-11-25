import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { supabase } from './lib/supabase'

type Country = { id: string; name: string; iso2: string | null }
type Visa = { id: string; country_id: string; name: string }
type Workflow = { id: string; name: string; country_id: string | null; visa_type_id: string | null }
type Stage = { id: string; workflow_id: string; name: string; position: number; is_terminal: boolean }

export default function SettingsPanel() {
  const [countries, setCountries] = useState<Country[]>([])
  const [visas, setVisas] = useState<Visa[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [stages, setStages] = useState<Stage[]>([])
  const [countryName, setCountryName] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [visaName, setVisaName] = useState('')
  const [visaCountry, setVisaCountry] = useState('')
  const [workflowName, setWorkflowName] = useState('')
  const [workflowCountry, setWorkflowCountry] = useState('')
  const [workflowVisa, setWorkflowVisa] = useState('')
  const [stageName, setStageName] = useState('')
  const [stageWorkflow, setStageWorkflow] = useState('')
  const [stageTerminal, setStageTerminal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function load() {
    if (!supabase) return
    const [c, v, w, s] = await Promise.all([
      supabase.from('countries').select('id,name,iso2').order('name'),
      supabase.from('visa_types').select('id,country_id,name').order('name'),
      supabase.from('workflow_templates').select('id,name,country_id,visa_type_id').order('name'),
      supabase.from('workflow_stages').select('id,workflow_id,name,position,is_terminal').order('position')
    ])
    const issue = c.error || v.error || w.error || s.error
    if (issue) { setError(issue.message); return }
    setCountries(c.data ?? []); setVisas(v.data ?? []); setWorkflows(w.data ?? []); setStages(s.data ?? [])
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
      <h2 style={heading}>مسارات العمل</h2>
      <form style={form} onSubmit={e => { e.preventDefault(); void save(() => supabase!.from('workflow_templates').insert({ name: workflowName.trim(), country_id: workflowCountry || null, visa_type_id: workflowVisa || null })) }}>
        <input style={field} placeholder="اسم المسار" value={workflowName} onChange={e => setWorkflowName(e.target.value)} required />
        <select style={field} value={workflowCountry} onChange={e => { setWorkflowCountry(e.target.value); setWorkflowVisa('') }}><option value="">كل الدول (اختياري)</option>{countries.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select style={field} value={workflowVisa} onChange={e => setWorkflowVisa(e.target.value)}><option value="">كل أنواع الفيزا (اختياري)</option>{visas.filter(x => !workflowCountry || x.country_id === workflowCountry).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <button style={button} disabled={busy}>إضافة مسار</button>
      </form>
      <div style={{ fontSize: 11, color: '#647187' }}>{workflows.length ? workflows.map(x => x.name).join(' · ') : 'لا توجد مسارات عمل'}</div>
    </section>
    <section style={card}>
      <h2 style={heading}>مراحل المسار</h2>
      <form style={form} onSubmit={e => { e.preventDefault(); const position = stages.filter(x => x.workflow_id === stageWorkflow).reduce((m,x) => Math.max(m,x.position), -1) + 1; void save(() => supabase!.from('workflow_stages').insert({ workflow_id: stageWorkflow, name: stageName.trim(), position, is_terminal: stageTerminal })) }}>
        <select style={field} value={stageWorkflow} onChange={e => setStageWorkflow(e.target.value)} required><option value="">اختر المسار</option>{workflows.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <input style={field} placeholder="اسم المرحلة" value={stageName} onChange={e => setStageName(e.target.value)} required />
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: '#647187' }}><input type="checkbox" checked={stageTerminal} onChange={e => setStageTerminal(e.target.checked)} /> مرحلة نهائية</label>
        <button style={button} disabled={busy || !workflows.length}>إضافة مرحلة</button>
      </form>
      {workflows.map(w => <div key={w.id} style={{ padding: '9px 0', borderTop: '1px solid #f0f2f6', fontSize: 11 }}><b>{w.name}</b><div style={{ color: '#748095', marginTop: 5 }}>{stages.filter(s => s.workflow_id === w.id).sort((a,b) => a.position-b.position).map(s => s.name + (s.is_terminal ? ' ✓' : '')).join(' ← ') || 'لم تُضف مراحل بعد'}</div></div>)}
    </section>
  </div>
}
