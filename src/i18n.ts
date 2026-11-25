import { useEffect, useState } from 'react'

export type Language = 'ar' | 'en'

const translations: Record<string, string> = Object.fromEntries([
  ['القائمة الرئيسية', 'Main menu'],
  ['نظرة عامة', 'Overview'],
  ['كل المعاملات', 'All cases'],
  ['معاملة جديدة', 'New case'],
  ['الوثائق', 'Documents'],
  ['الإدارة', 'Administration'],
  ['الموظفون', 'Employees'],
  ['الحسابات', 'Accounts'],
  ['إعدادات النظام', 'System settings'],
  ['مدير النظام', 'System administrator'],
  ['مدير', 'Manager'],
  ['موظف', 'Employee'],
  ['تسجيل الخروج', 'Sign out'],
  ['العمليات', 'Operations'],
  ['المعاملات', 'Cases'],
  ['الإشعارات', 'Notifications'],
  ['إدارة معاملات الفيزا،', 'Visa case management,'],
  ['بصورة أوضح.', 'made clearer.'],
  ['منصة داخلية لمتابعة معاملات التأشيرات والوثائق والـ Pipelines.', 'An internal platform to track visa applications, documents, and pipelines.'],
  ['البريد الإلكتروني', 'Email address'],
  ['كلمة المرور', 'Password'],
  ['جارٍ تسجيل الدخول...', 'Signing in...'],
  ['تسجيل الدخول', 'Sign in'],
  ['دخول مخصص لموظفي Blue Line Travel', 'For Blue Line Travel staff only'],
  ['كل معاملة', 'Every application'],
  ['إلها مسار واضح.', 'has a clear path.'],
  ['متابعة منظمة من أول تواصل إلى صدور القرار.', 'Organized tracking from first contact to final decision.'],
  ['ملف مستقل لكل طلب', 'A separate file for every application'],
  ['Pipelines واضحة', 'Clear pipelines'],
  ['صلاحيات حسب الدور', 'Role-based access'],
  ['أهلاً ', 'Welcome, '],
  ['هذا ملخص حركة معاملات الفيزا.', 'Here is your visa operations summary.'],
  ['إدارة بيانات الدول وأنواع التأشيرات والـ Pipelines.', 'Manage countries, visa types, and pipelines.'],
  ['رفع ومراجعة مستندات كل معاملة ضمن مساحة تخزين خاصة.', 'Upload and review each case document in private storage.'],
  ['إجمالي المعاملات', 'Total cases'],
  ['كل الملفات المسجلة', 'All registered files'],
  ['قيد الإجراء', 'In progress'],
  ['معاملات مفتوحة حالياً', 'Currently open cases'],
  ['متجاوزة الموعد', 'Overdue'],
  ['تحتاج إلى متابعة', 'Need follow-up'],
  ['مكتملة', 'Completed'],
  ['تم إنهاء إجراءاتها', 'Successfully processed'],
  ['آخر المعاملات', 'Recent cases'],
  ['أحدث الملفات التي تم إنشاؤها', 'Latest created files'],
  ['عرض الكل', 'View all'],
  ['توزيع الملفات حسب Pipeline', 'Cases grouped by pipeline'],
  ['أضف Pipelines من إعدادات النظام حتى تظهر هنا.', 'Add pipelines in system settings to see them here.'],
  ['تظهر المعاملات داخل Pipeline المخصصة لها.', 'Applications appear inside their assigned pipeline.'],
  ['سجل المعاملات', 'Case register'],
  ['ملف', 'files'],
  ['ابحث بالاسم أو رقم المعاملة...', 'Search by name or case number...'],
  ['طريقة عرض المعاملات', 'Case display mode'],
  ['عرض جدولي', 'Table view'],
  ['جدول', 'Table'],
  ['عرض كانبان', 'Kanban view'],
  ['نظام متابعة معاملات التأشيرات · إصدار أولي', 'Visa case tracking system · Initial release'],
  ['جارٍ تحميل بيانات النظام...', 'Loading system data...'],
  ['رقم المعاملة', 'Case number'],
  ['اسم العميل', 'Customer name'],
  ['الأولوية', 'Priority'],
  ['الحالة', 'Status'],
  ['تاريخ الإنشاء', 'Created date'],
  ['ماكو معاملات لحد الآن', 'No cases yet'],
  ['أنشئ أول معاملة حتى تبدأ المتابعة.', 'Create the first case to start tracking.'],
  ['بدون رقم', 'No number'],
  ['بدون رقم هاتف', 'No phone number'],
  ['بدون رقم', 'No number'],
  ['عاجل', 'Urgent'],
  ['مرتفع', 'High'],
  ['منخفض', 'Low'],
  ['اعتيادي', 'Normal'],
  ['معلقة', 'On hold'],
  ['ملغاة', 'Cancelled'],
  ['قيد الإجراء', 'In progress'],
  ['لا توجد معاملات', 'No cases'],
  ['إنشاء معاملة جديدة', 'Create a new case'],
  ['كل طلب يُحفظ كملف مستقل للعميل.', 'Each application is saved as a separate customer file.'],
  ['اسم العميل', 'Customer name'],
  ['الاسم الكامل', 'Full name'],
  ['رقم الهاتف', 'Phone number'],
  ['الدولة', 'Country'],
  ['اختر الدولة', 'Select country'],
  ['نوع الفيزا', 'Visa type'],
  ['اختر النوع', 'Select type'],
  ['Pipeline', 'Pipeline'],
  ['اختر Pipeline', 'Select pipeline'],
  ['إلغاء', 'Cancel'],
  ['جارٍ الحفظ...', 'Saving...'],
  ['حفظ المعاملة', 'Save case'],
  ['باقي ربط إعدادات الدخول', 'Finish connecting sign-in settings'],
  ['واجهة النظام جاهزة. أضف بيانات Supabase العامة إلى متغيرات البيئة حتى نفعّل تسجيل الدخول.', 'The application is ready. Add your public Supabase environment values to enable sign-in.'],
  ['استخدم anon / publishable key فقط. لا تضع service role key في الواجهة.', 'Use only the anon / publishable key. Never put the service role key in the frontend.'],
  ['الدول', 'Countries'],
  ['أنواع التأشيرات', 'Visa types'],
  ['Pipelines', 'Pipelines'],
  ['تم الحفظ بنجاح', 'Saved successfully'],
  ['اسم الدولة', 'Country name'],
  ['ISO2 (اختياري)', 'ISO2 (optional)'],
  ['إضافة دولة', 'Add country'],
  ['لا توجد دول مضافة بعد', 'No countries added yet'],
  ['مثال: سياحية / عمل / دراسة', 'Example: Tourist / Work / Study'],
  ['إضافة نوع', 'Add type'],
  ['لا توجد أنواع تأشيرات', 'No visa types'],
  ['اسم Pipeline', 'Pipeline name'],
  ['إضافة Pipeline', 'Add Pipeline'],
  ['لا توجد معاملات بعد', 'No cases yet'],
  ['أنشئ معاملة أولاً حتى تتمكن من إرفاق وثائقها.', 'Create a case first to attach its documents.'],
  ['وثائق المعاملة', 'Case documents'],
  ['الملفات محفوظة في مخزن خاص ولا تُعرض بروابط عامة.', 'Files are stored privately and are not exposed through public links.'],
  ['تحديث', 'Refresh'],
  ['اختر المعاملة', 'Select case'],
  ['رقم المعاملة غير متوفر', 'Case number unavailable'],
  ['ملف مرفوع', 'uploaded files'],
  ['جارٍ تحميل الوثائق...', 'Loading documents...'],
  ['نوع مستند غير معروف', 'Unknown document type'],
  ['مطلوب', 'Required'],
  ['اختياري', 'Optional'],
  ['مرفوع', 'Uploaded'],
  ['بانتظار الرفع', 'Awaiting upload'],
  ['مقبول', 'Approved'],
  ['مرفوض', 'Rejected'],
  ['بانتظار المراجعة', 'Pending review'],
  ['تنزيل الملف', 'Download file'],
  ['جارٍ الرفع...', 'Uploading...'],
  ['رفع نسخة جديدة', 'Upload new version'],
  ['رفع المستند', 'Upload document'],
  ['ماكو متطلبات وثائق معرفة لهذا النوع', 'No document requirements defined for this type'],
  ['أضف أنواع المستندات ومتطلباتها من إعدادات النظام، وبعدها راح تظهر هنا تلقائياً.', 'Add document types and requirements in system settings; they will appear here automatically.'],
  ['الحد الأعلى للملف الواحد 20 MB. الأنواع المدعومة: PDF، الصور، Word وExcel.', 'Maximum file size: 20 MB. Supported formats: PDF, images, Word, and Excel.'],
  ['حجم الملف يتجاوز الحد المسموح (20 MB).', 'File exceeds the maximum allowed size (20 MB).'],
  ['نوع الملف غير مدعوم. ارفع PDF أو صورة أو ملف Word/Excel.', 'Unsupported file type. Upload a PDF, image, Word, or Excel file.'],
  ['تعذر إنشاء رابط التنزيل.', 'Could not create download link.'],
  ['إدارة الوثائق', 'Document management'],
  ['نظام متابعة معاملات التأشيرات', 'Visa application tracking system'],
  ['إغلاق القائمة', 'Close menu'],
  ['VISA OPERATIONS / 01', 'VISA OPERATIONS / 01'],
  ['عمليات التأشيرات', 'Visa operations'],
  ['إدارة معاملات الفيزا،', 'Visa case management,'],
  ['مستخدم', 'User'],
  ['كل المعاملات', 'All cases'],
  ['إجمالي المعاملات', 'Total cases'],
  ['بدون رقم هاتف', 'No phone number'],
  ['NEW APPLICATION', 'NEW APPLICATION'],
  ['إنشاء معاملة جديدة', 'Create a new case'],
  ['رقم الهاتف', 'Phone number'],
  ['اسم العميل', 'Customer name'],
  ['اختر النوع', 'Select type'],
  ['اختر الدولة', 'Select country'],
  ['اختر Pipeline', 'Select pipeline'],
  ['الاسم الكامل', 'Full name'],
  ['كل طلب يُحفظ كملف مستقل للعميل.', 'Each application is saved as a separate customer file.'],
  ['ماكو معاملات لحد الآن', 'No cases yet'],
  ['ماكو متطلبات وثائق معرفة لهذا النوع', 'No document requirements defined for this type'],
  ['أنشئ أول معاملة حتى تبدأ المتابعة.', 'Create the first case to start tracking.'],
  ['أضف أنواع المستندات ومتطلباتها من إعدادات النظام، وبعدها راح تظهر هنا تلقائياً.', 'Add document types and requirements in system settings; they will appear here automatically.'],
  ['تم رفع «', 'Uploaded “'],
  ['» بنجاح.', '” successfully.'],
  ['تم رفع الملف لكن تعذر تسجيله في المعاملة: ', 'The file was uploaded but could not be recorded on the case: '],
  ['لا توجد معاملات بعد', 'No cases yet'],
  ['أنشئ معاملة أولاً حتى تتمكن من إرفاق وثائقها.', 'Create a case first to attach its documents.'],
  ['رقم المعاملة غير متوفر', 'Case number unavailable'],
  ['حجم الملف يتجاوز الحد المسموح (20 MB).', 'File exceeds the maximum allowed size (20 MB).'],
  ['نوع الملف غير مدعوم. ارفع PDF أو صورة أو ملف Word/Excel.', 'Unsupported file type. Upload a PDF, image, Word, or Excel file.'],
  ['تعذر إنشاء رابط التنزيل.', 'Could not create download link.'],
  ['تم رفع الملف', 'File uploaded'],
  ['الملفات محفوظة في مخزن خاص ولا تُعرض بروابط عامة.', 'Files are stored privately and are not exposed through public links.'],
  ['ISO2 (اختياري)', 'ISO2 (optional)'],
  ['مثال: سياحية / عمل / دراسة', 'Example: Tourist / Work / Study'],
  ['لا توجد دول مضافة بعد', 'No countries added yet'],
  ['لا توجد أنواع تأشيرات', 'No visa types'],
  ['لا توجد Pipelines', 'No pipelines'],
  ['صلاحيات حسب الدور', 'Role-based access'],
['اسم Pipeline', 'Pipeline name'],
  ['اسم Pipeline جديد', 'New pipeline name'],
  ['جارٍ الإنشاء...', 'Creating...'],
  ['إضافة Pipeline', 'Add Pipeline'],
  ['ماكو Pipelines بعد', 'No pipelines yet'],
  ['أنشئ أول Pipeline حتى تبدأ بتنظيم طلبات الفيزا.', 'Create the first pipeline to start organizing visa applications.'],
  ['ما تم إنشاء Pipelines لحد الآن.', 'Pipelines have not been created yet.'],
  ['نقل إلى Pipeline', 'Move to pipeline'],
  ['اسحب الطلب إلى هنا', 'Drag an application here'],
])

function translate(value: string) {
  let result = value
  for (const [ar, en] of Object.entries(translations).sort((a,b) => b[0].length-a[0].length)) {
    result = result.replaceAll(ar, en)
  }
  return result
}

export function useLanguage() {
  const [language, setLanguage] = useState<Language>(() => {
    try { return localStorage.getItem('blueline-language') === 'en' ? 'en' : 'ar' } catch { return 'ar' }
  })
  const isEnglish = language === 'en'

  useEffect(() => {
    const root = document.documentElement
    root.lang = language
    root.dir = isEnglish ? 'ltr' : 'rtl'
    try { localStorage.setItem('blueline-language', language) } catch { /* storage may be unavailable */ }

    const originalText = new WeakMap<Text, { source: string; rendered: string }>()
    const originalAttrs = new WeakMap<Element, Map<string, { source: string; rendered: string }>>()
    const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const scan = () => {
      textWalker.currentNode = document.body
      let node: Node | null
      while ((node = textWalker.nextNode())) {
        const text = node as Text
        const current = text.data
        let record = originalText.get(text)
        if (!record || current !== record.rendered) record = { source: current, rendered: current }
        const rendered = isEnglish ? translate(record.source) : record.source
        if (current !== rendered) text.data = rendered
        originalText.set(text, { source: record.source, rendered })
      }
      document.querySelectorAll<HTMLElement>('[placeholder],[title],[aria-label]').forEach(element => {
        const records = originalAttrs.get(element) ?? new Map()
        for (const attr of ['placeholder','title','aria-label']) {
          const current = element.getAttribute(attr)
          if (current === null) continue
          let record = records.get(attr)
          if (!record || current !== record.rendered) record = { source: current, rendered: current }
          const rendered = isEnglish ? translate(record.source) : record.source
          if (current !== rendered) element.setAttribute(attr, rendered)
          records.set(attr, { source: record.source, rendered })
        }
        originalAttrs.set(element, records)
      })
    }
    scan()
    const observer = new MutationObserver(() => scan())
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder','title','aria-label'] })
    return () => observer.disconnect()
  }, [language, isEnglish])

  return { language, isEnglish, toggleLanguage: () => setLanguage(current => current === 'ar' ? 'en' : 'ar') }
}
