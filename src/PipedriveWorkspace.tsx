import { useEffect, useMemo, useState } from 'react'
import { Building2, RefreshCw, Search, Users, Phone, MapPin, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from './lib/supabase'

type Person = { external_id: string; name: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; organization_name: string | null; synced_at: string }
type Organization = { external_id: string; name: string; phone: string | null; address: string | null; website: string | null; synced_at: string }

export default function PipedriveWorkspace({ isEnglish }: { isEnglish: boolean }) {
  const [tab, setTab] = useState<'people' | 'organizations'>('people')
  const [people, setPeople] = useState<Person[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [connected, setConnected] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [counts, setCounts] = useState({ people: 0, organizations: 0 })
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const invoke = async (action: string) => {
    if (!supabase) throw new Error('Supabase is not configured')
    const { data, error } = await supabase.functions.invoke('pipedrive-integration', { body: { action } })
    if (error) {
      let message = error.message || 'Request failed'
      const context = (error as { context?: unknown }).context
      if (context instanceof Response) {
        try { const body = await context.clone().json(); if (body?.error) message = String(body.error) } catch {}
      }
      throw new Error(message)
    }
    if (data?.error) throw new Error(data.error)
    return data
  }

  async function loadDirectory() {
    if (!supabase) return
    const [p, o, c] = await Promise.all([
      supabase.from('pipedrive_people').select('external_id,name,first_name,last_name,phone,email,organization_name,synced_at').order('name').limit(10000),
      supabase.from('pipedrive_organizations').select('external_id,name,phone,address,website,synced_at').order('name').limit(10000),
      invoke('config')
    ])
    if (p.error) throw p.error
    if (o.error) throw o.error
    setPeople(p.data ?? [])
    setOrganizations(o.data ?? [])
    setConnected(!!c.connected)
    setLastSynced(c.lastSyncedAt || null)
    setCounts({ people: c.peopleCount || p.data?.length || 0, organizations: c.organizationCount || o.data?.length || 0 })
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      try { await loadDirectory() }
      catch (e) { if (active) setError(e instanceof Error ? e.message : 'Unable to load Pipedrive data') }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [])

  async function syncNow() {
    setSyncing(true); setError(''); setNotice('')
    try {
      const result = await invoke('sync')
      await loadDirectory()
      setNotice(isEnglish
        ? `Sync completed: ${result.peopleCount} people and ${result.organizationCount} organizations imported.`
        : `اكتمل الاستيراد: ${result.peopleCount} شخص و${result.organizationCount} شركة.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر استيراد بيانات Pipedrive') }
    finally { setSyncing(false) }
  }

  const filteredPeople = useMemo(() => people.filter(x => [x.name, x.phone, x.email, x.organization_name].some(v => v?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [people, query])
  const filteredOrganizations = useMemo(() => organizations.filter(x => [x.name, x.phone, x.address, x.website].some(v => v?.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [organizations, query])
  const label = (ar: string, en: string) => isEnglish ? en : ar
  const panel: React.CSSProperties = { background: 'var(--panel, #fff)', border: '1px solid var(--border, #e8edf4)', borderRadius: 14, padding: 20 }
  const muted: React.CSSProperties = { color: 'var(--muted, #8793a5)' }
  const input: React.CSSProperties = { width: '100%', minWidth: 180, border: '1px solid var(--border, #e2e8f0)', borderRadius: 9, padding: '11px 13px', background: 'var(--input-bg, #fff)', color: 'var(--text, #26364c)', font: 'inherit', fontSize: 12 }

  return <div style={{ display: 'grid', gap: 18 }}>
    <section style={{ ...panel, background: 'linear-gradient(125deg,#172943,#24466d)', color: '#fff', border: 0, padding: 25 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#ffffff1c', display: 'grid', placeItems: 'center' }}><ExternalLink size={26}/></div>
          <div><span style={{ fontSize: 10, letterSpacing: 1.7, opacity: .7 }}>SALES CRM INTEGRATION</span><h1 style={{ margin: '4px 0', fontSize: 25 }}>Pipedrive</h1><p style={{ margin: 0, fontSize: 12, opacity: .76 }}>{label('دليل جهات الاتصال والشركات المستورد من حساب Pipedrive','Contacts and organizations imported from your Pipedrive account')}</p></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 30, padding: '7px 11px', background: '#ffffff18', fontSize: 11 }}><span style={{ width: 7, height: 7, borderRadius: 10, background: connected ? '#56d69c' : '#e6ad5a' }}/>{connected ? label('الحساب مربوط','Connected') : label('غير مربوط','Not connected')}</span>
          <button type="button" onClick={() => void syncNow()} disabled={!connected || syncing || loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: 0, borderRadius: 9, padding: '11px 15px', background: '#fff', color: '#172943', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: !connected || syncing ? .55 : 1 }}><RefreshCw size={15} style={{ animation: syncing ? 'spin 1s linear infinite' : undefined }}/>{syncing ? label('جارٍ الاستيراد...','Syncing...') : label('مزامنة الآن','Sync now')}</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 26, marginTop: 24, flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: 25, fontWeight: 700 }}>{counts.people.toLocaleString()}</div><div style={{ fontSize: 10, opacity: .7 }}>{label('جهة اتصال','People')}</div></div>
        <div><div style={{ fontSize: 25, fontWeight: 700 }}>{counts.organizations.toLocaleString()}</div><div style={{ fontSize: 10, opacity: .7 }}>{label('شركة','Organizations')}</div></div>
        <div><div style={{ fontSize: 11, opacity: .7, marginTop: 6 }}>{label('آخر مزامنة','Last sync')}</div><div style={{ fontSize: 11, marginTop: 5 }}>{lastSynced ? new Intl.DateTimeFormat(isEnglish ? 'en-GB' : 'ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastSynced)) : label('لم تتم المزامنة بعد','Not synced yet')}</div></div>
      </div>
    </section>

    {notice && <div style={{ padding: 12, borderRadius: 9, background: '#eaf8f0', color: '#21865e', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}><CheckCircle2 size={16}/>{notice}</div>}
    {error && <div className="error-banner"><AlertCircle size={16}/>{error}</div>}
    {!connected && !loading && <div style={{ ...panel, fontSize: 12, ...muted }}>{label('اربط حساب Pipedrive أولاً من إعدادات النظام، ثم ارجع إلى هذا التطبيق واضغط مزامنة الآن.','Connect Pipedrive in System Settings first, then return here and select Sync now.')}</div>}

    <section style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 17 }}>
        <div><h2 style={{ margin: 0, fontSize: 17, color: 'var(--text, #1e2b40)' }}>{label('دليل Pipedrive','Pipedrive directory')}</h2><p style={{ margin: '5px 0 0', fontSize: 11, ...muted }}>{label('بيانات مستوردة من حساب الشركة','Imported records from your company account')}</p></div>
        <div style={{ position: 'relative', minWidth: 240, flex: '0 1 340px' }}><Search size={16} style={{ position: 'absolute', right: isEnglish ? 'auto' : 12, left: isEnglish ? 12 : 'auto', top: 12, ...muted }}/><input style={{ ...input, paddingInlineStart: 35 }} value={query} onChange={e => setQuery(e.target.value)} placeholder={label('ابحث بالاسم أو الرقم أو الشركة...','Search name, phone or company...')}/></div>
      </div>
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border, #e8edf4)', marginBottom: 15 }}>
        <button type="button" onClick={() => setTab('people')} style={{ border: 0, borderBottom: tab === 'people' ? '2px solid #b18a4c' : '2px solid transparent', background: 'transparent', color: tab === 'people' ? 'var(--text, #1e2b40)' : muted.color, padding: '10px 14px', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700 }}><Users size={16}/>{label('الأشخاص','People')} ({people.length})</button>
        <button type="button" onClick={() => setTab('organizations')} style={{ border: 0, borderBottom: tab === 'organizations' ? '2px solid #b18a4c' : '2px solid transparent', background: 'transparent', color: tab === 'organizations' ? 'var(--text, #1e2b40)' : muted.color, padding: '10px 14px', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700 }}><Building2 size={16}/>{label('الشركات','Organizations')} ({organizations.length})</button>
      </div>
      {loading ? <div className="loading-card">{label('جارٍ تحميل البيانات...','Loading records...')}</div> : tab === 'people' ? (
        filteredPeople.length ? <div style={{ overflowX: 'auto' }}><table style={{ minWidth: 680 }}><thead><tr><th>{label('الاسم','Name')}</th><th>{label('رقم الهاتف','Phone')}</th><th>Email</th><th>{label('الشركة','Organization')}</th></tr></thead><tbody>{filteredPeople.map(p => <tr key={p.external_id}><td><b>{p.name}</b><small>PD #{p.external_id}</small></td><td dir="ltr">{p.phone || '—'}</td><td dir="ltr">{p.email || '—'}</td><td>{p.organization_name || '—'}</td></tr>)}</tbody></table></div> : <div className="empty-state"><Users size={25}/><b>{label('لا توجد جهات اتصال','No people found')}</b><span>{label('نفّذ المزامنة لاستيراد الأسماء والأرقام.','Run a sync to import names and phone numbers.')}</span></div>
      ) : filteredOrganizations.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>{filteredOrganizations.map(o => <article key={o.external_id} style={{ border: '1px solid var(--border, #e8edf4)', borderRadius: 12, padding: 16, minWidth: 0 }}><div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 12 }}><div style={{ width: 38, height: 38, borderRadius: 10, background: '#eaf1fb', color: '#3768a7', display: 'grid', placeItems: 'center' }}><Building2 size={19}/></div><div style={{ minWidth: 0 }}><b style={{ display: 'block', color: 'var(--text, #24334a)', fontSize: 13 }}>{o.name}</b><small style={muted}>PD #{o.external_id}</small></div></div><div style={{ display: 'grid', gap: 8, fontSize: 11, ...muted }}>{o.phone && <span><Phone size={13} style={{ verticalAlign: 'middle', marginInlineEnd: 6 }}/>{o.phone}</span>}{o.address && <span><MapPin size={13} style={{ verticalAlign: 'middle', marginInlineEnd: 6 }}/>{o.address}</span>}{o.website && <span><ExternalLink size={13} style={{ verticalAlign: 'middle', marginInlineEnd: 6 }}/>{o.website}</span>}</div></article>)}</div> : <div className="empty-state"><Building2 size={25}/><b>{label('لا توجد شركات','No organizations found')}</b><span>{label('نفّذ المزامنة لاستيراد الشركات.','Run a sync to import organizations.')}</span></div>}
    </section>
    <div style={{ fontSize: 10, textAlign: 'center', ...muted }}>{label('البيانات للعرض والبحث داخل Blue Line Visa. مصدر السجل هو Pipedrive.','Records are mirrored for viewing and search in Blue Line Visa. Pipedrive remains the source of truth.')}</div>
  </div>
}
