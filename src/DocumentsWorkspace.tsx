import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, UploadCloud, RefreshCw, AlertCircle, CheckCircle2, Clock3 } from 'lucide-react'
import type { VisaCase } from './types'
import { supabase } from './lib/supabase'

type Requirement = { id: string; document_type_id: string; is_required: boolean; instructions: string | null }
type DocumentType = { id: string; name: string; description: string | null }
type CaseDocument = { id: string; document_type_id: string | null; storage_path: string; original_filename: string; mime_type: string | null; uploaded_at: string; review_status: 'pending' | 'approved' | 'rejected'; review_note: string | null }

const MAX_FILE_SIZE = 20 * 1024 * 1024
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])

export default function DocumentsWorkspace({ cases, userId }: { cases: VisaCase[]; userId: string }) {
  const [caseId, setCaseId] = useState(cases[0]?.id ?? '')
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [types, setTypes] = useState<DocumentType[]>([])
  const [documents, setDocuments] = useState<CaseDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selectedCase = useMemo(() => cases.find(item => item.id === caseId), [cases, caseId])
  const typeById = useMemo(() => new Map(types.map(item => [item.id, item])), [types])

  async function loadDocuments() {
    if (!supabase || !selectedCase) { setRequirements([]); setTypes([]); setDocuments([]); return }
    setLoading(true); setError(''); setNotice('')
    const [reqResult, typeResult, docResult] = await Promise.all([
      supabase.from('document_requirements').select('id,document_type_id,is_required,instructions').eq('visa_type_id', selectedCase.visa_type_id),
      supabase.from('document_types').select('id,name,description').eq('is_active', true).order('name'),
      supabase.from('case_documents').select('id,document_type_id,storage_path,original_filename,mime_type,uploaded_at,review_status,review_note').eq('case_id', selectedCase.id).order('uploaded_at', { ascending: false })
    ])
    const failure = reqResult.error || typeResult.error || docResult.error
    if (failure) setError(failure.message)
    setRequirements(reqResult.data ?? [])
    setTypes(typeResult.data ?? [])
    setDocuments((docResult.data ?? []) as CaseDocument[])
    setLoading(false)
  }

  useEffect(() => { void loadDocuments() }, [caseId, cases.length])

  async function uploadDocument(requirement: Requirement, file?: File) {
    if (!supabase || !selectedCase || !file) return
    setError(''); setNotice('')
    if (file.size > MAX_FILE_SIZE) { setError('حجم الملف يتجاوز الحد المسموح (20 MB).'); return }
    if (!ALLOWED_TYPES.has(file.type)) { setError('نوع الملف غير مدعوم. ارفع PDF أو صورة أو ملف Word/Excel.'); return }
    const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-100) || 'document'
    const path = `${selectedCase.id}/${crypto.randomUUID()}-${safeName}`
    setBusyId(requirement.id)
    const { error: storageError } = await supabase.storage.from('visa-case-documents').upload(path, file, { contentType: file.type, upsert: false })
    if (storageError) { setError(storageError.message); setBusyId(''); return }
    const { error: metadataError } = await supabase.from('case_documents').insert({
      case_id: selectedCase.id,
      document_type_id: requirement.document_type_id,
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type || null,
      uploaded_by: userId
    })
    if (metadataError) {
      await supabase.storage.from('visa-case-documents').remove([path])
      setError(`تم رفع الملف لكن تعذر تسجيله في المعاملة: ${metadataError.message}`)
    } else {
      setNotice(`تم رفع «${file.name}» بنجاح.`)
      await loadDocuments()
    }
    setBusyId('')
  }

  async function downloadDocument(doc: CaseDocument) {
    if (!supabase) return
    setError('')
    const { data, error: signedError } = await supabase.storage.from('visa-case-documents').createSignedUrl(doc.storage_path, 60)
    if (signedError || !data?.signedUrl) { setError(signedError?.message || 'تعذر إنشاء رابط التنزيل.'); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (!cases.length) return <section className="panel"><div className="empty-state"><FileText size={26}/><b>لا توجد معاملات بعد</b><span>أنشئ معاملة أولاً حتى تتمكن من إرفاق وثائقها.</span></div></section>

  return <section className="panel documents-panel">
    <div className="panel-head documents-heading"><div><h2>وثائق المعاملة</h2><p>الملفات محفوظة في مخزن خاص ولا تُعرض بروابط عامة.</p></div><button className="secondary-btn" onClick={() => void loadDocuments()} disabled={loading}><RefreshCw size={15}/> تحديث</button></div>
    <label className="document-case-select">اختر المعاملة
      <select value={caseId} onChange={event => setCaseId(event.target.value)}>
        {cases.map(item => <option key={item.id} value={item.id}>{item.case_number || 'بدون رقم'} — {item.customer_full_name}</option>)}
      </select>
    </label>
    {selectedCase && <div className="document-case-summary"><b>{selectedCase.customer_full_name}</b><span>{selectedCase.case_number || 'رقم المعاملة غير متوفر'}</span><span>{documents.length} ملف مرفوع</span></div>}
    {error && <div className="error-line document-message"><AlertCircle size={15}/>{error}</div>}
    {notice && <div className="success-line document-message"><CheckCircle2 size={15}/>{notice}</div>}
    {loading ? <div className="loading-card">جارٍ تحميل الوثائق...</div> : requirements.length ? <div className="requirements-list">
      {requirements.map(requirement => {
        const docType = typeById.get(requirement.document_type_id)
        const files = documents.filter(doc => doc.document_type_id === requirement.document_type_id)
        return <article className="requirement-card" key={requirement.id}>
          <div className="requirement-info"><div className="requirement-icon"><FileText size={18}/></div><div><b>{docType?.name || 'نوع مستند غير معروف'}</b><small>{requirement.is_required ? 'مطلوب' : 'اختياري'}{requirement.instructions ? ` · ${requirement.instructions}` : ''}</small></div><span className={files.length ? 'document-state uploaded' : 'document-state missing'}>{files.length ? 'مرفوع' : 'بانتظار الرفع'}</span></div>
          {files.map(doc => <div className="uploaded-document" key={doc.id}><div><b>{doc.original_filename}</b><small><Clock3 size={12}/> {new Intl.DateTimeFormat('en-GB').format(new Date(doc.uploaded_at))} · {doc.review_status === 'approved' ? 'مقبول' : doc.review_status === 'rejected' ? 'مرفوض' : 'بانتظار المراجعة'}</small>{doc.review_note && <small>{doc.review_note}</small>}</div><button className="document-download" onClick={() => void downloadDocument(doc)} title="تنزيل الملف"><Download size={16}/></button></div>)}
          <label className="upload-control"><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" disabled={busyId === requirement.id} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadDocument(requirement, file); event.currentTarget.value = '' }}/> <UploadCloud size={16}/>{busyId === requirement.id ? 'جارٍ الرفع...' : files.length ? 'رفع نسخة جديدة' : 'رفع المستند'}</label>
        </article>
      })}
    </div> : <div className="empty-state documents-empty"><FileText size={25}/><b>ماكو متطلبات وثائق معرفة لهذا النوع</b><span>أضف أنواع المستندات ومتطلباتها من إعدادات النظام، وبعدها راح تظهر هنا تلقائياً.</span></div>}
    <div className="document-footnote">الحد الأعلى للملف الواحد 20 MB. الأنواع المدعومة: PDF، الصور، Word وExcel.</div>
  </section>
}
