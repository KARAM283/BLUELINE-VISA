import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
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
