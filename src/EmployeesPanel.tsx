import { useEffect, useMemo, useState } from 'react'
import { Edit3, Plus, RefreshCw, Search, ShieldCheck, UserRound, UserX, Users } from 'lucide-react'
import { createPortal } from 'react-dom'
import { supabase } from './lib/supabase'
import type { AppRole } from './types'
import type { CSSProperties, FormEvent } from 'react'

type EmployeeUser = { id:string; email:string; full_name:string; is_active:boolean; roles:string[]; created_at:string }
const roleLabel:Record<string,string>={admin:'مدير النظام',manager:'مدير',employee:'موظف'}
export default function EmployeesPanel({currentUserId}:{currentUserId:string}) {
  const [users,setUsers]=useState<EmployeeUser[]>([])
  const [search,setSearch]=useState('')
  const [name,setName]=useState('')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [role,setRole]=useState<AppRole>('employee')
  const [showCreate,setShowCreate]=useState(false)
  const [editing,setEditing]=useState<EmployeeUser|null>(null)
  const [editName,setEditName]=useState('')
  const [editEmail,setEditEmail]=useState('')
  const [editPassword,setEditPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  async function invoke(payload:Record<string,unknown>) {
    if(!supabase)throw new Error('Supabase غير متصل')
    const {data,error}=await supabase.functions.invoke('employee-admin',{body:payload})
    if(error){let message=error.message;const context=(error as {context?:unknown}).context;if(context instanceof Response){try{const json=await context.clone().json();if(json?.error)message=String(json.error)}catch{}}throw new Error(message)}
    if(data?.error)throw new Error(data.error)
    return data
  }
  async function load(){setBusy(true);setError('');try{const data=await invoke({action:'list'});setUsers(data.users||[])}catch(e){setError(e instanceof Error?e.message:'تعذر تحميل الحسابات')}finally{setBusy(false)}}
  useEffect(()=>{void load()},[])
  const filtered=useMemo(()=>users.filter(u=>[u.full_name,u.email,...u.roles].join(' ').toLowerCase().includes(search.toLowerCase())),[users,search])
  async function create(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{await invoke({action:'create',full_name:name,email,password,role});setName('');setEmail('');setPassword('');setRole('employee');setShowCreate(false);setNotice('تم إنشاء حساب الموظف بنجاح');await load()}catch(e){setError(e instanceof Error?e.message:'تعذر إنشاء الحساب')}finally{setBusy(false)}}
  function openEdit(user:EmployeeUser){setEditing(user);setEditName(user.full_name);setEditEmail(user.email);setEditPassword('');setError('');setNotice('')}
  async function saveEdit(e:FormEvent){e.preventDefault();if(!editing)return;if(editPassword&&editPassword.length<8){setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');return}await update(editing,{full_name:editName,email:editEmail,...(editPassword?{password:editPassword}:{})});setEditing(null);setEditPassword('')}
  async function update(user:EmployeeUser,patch:Record<string,unknown>){setBusy(true);setError('');setNotice('');try{await invoke({action:'update',user_id:user.id,...patch});setNotice('تم تحديث بيانات الحساب');await load()}catch(e){setError(e instanceof Error?e.message:'تعذر تحديث الحساب')}finally{setBusy(false)}}
  const field:CSSProperties={width:'100%',minWidth:0,border:'1px solid #dce3ed',borderRadius:9,padding:'11px 12px',background:'#fbfcfe',color:'#24334a',font:'inherit',fontSize:12}
  const button:CSSProperties={border:0,borderRadius:9,padding:'10px 13px',background:'#172943',color:'#fff',fontSize:11,fontWeight:700,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:7}
  const card:CSSProperties={background:'#fff',border:'1px solid #e8edf4',borderRadius:15,padding:18,marginBottom:15}
  return <div style={{maxWidth:1200,margin:'0 auto'}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:18}}>
      <div><div style={{display:'flex',alignItems:'center',gap:8,color:'#66758b',fontSize:11,marginBottom:5}}><Users size={15}/> USER MANAGEMENT</div><h1 style={{fontSize:23,color:'#1d2c42',margin:0}}>إدارة الموظفين</h1><p style={{fontSize:12,color:'#7b8798',margin:'6px 0 0'}}>إنشاء حسابات الدخول وإدارة الصلاحيات وحالة الحساب</p></div>
      <div style={{display:'flex',gap:8}}><button style={{...button,background:'#eef2f8',color:'#34445d'}} onClick={()=>void load()} disabled={busy}><RefreshCw size={15}/> تحديث</button><button style={button} onClick={()=>setShowCreate(v=>!v)}><Plus size={15}/> إضافة موظف</button></div>
    </div>
    {error&&<div className="error-banner" style={{marginBottom:12}}>{error}</div>}
    {notice&&<div style={{...card,color:'#21865e',background:'#effaf4',fontSize:12}}>{notice}</div>}
    {showCreate&&<section style={card}><h2 style={{fontSize:15,color:'#24334a',margin:'0 0 14px'}}>إنشاء حساب جديد</h2><form onSubmit={create} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>
      <input style={field} placeholder="الاسم الكامل" value={name} onChange={e=>setName(e.target.value)} required/>
      <input style={field} type="email" placeholder="البريد الإلكتروني" value={email} onChange={e=>setEmail(e.target.value)} required/>
      <input style={field} type="password" placeholder="كلمة المرور (8 أحرف على الأقل)" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} required autoComplete="new-password"/>
      <select style={field} value={role} onChange={e=>setRole(e.target.value as AppRole)}><option value="employee">موظف</option><option value="manager">مدير</option><option value="admin">مدير النظام</option></select>
      <div style={{display:'flex',gap:8,alignItems:'center'}}><button style={button} disabled={busy}>إنشاء الحساب</button><button type="button" style={{...button,background:'#eef2f8',color:'#34445d'}} onClick={()=>setShowCreate(false)}>إلغاء</button></div>
    </form><p style={{fontSize:10,color:'#778399',margin:'12px 0 0'}}>الحساب يُنشأ مفعّلاً، ويمكن للموظف تسجيل الدخول مباشرة باستخدام الإيميل وكلمة المرور المحددين.</p></section>}
    <section style={card}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:15,flexWrap:'wrap'}}><div style={{position:'relative',flex:1,minWidth:220}}><Search size={15} style={{position:'absolute',right:11,top:12,color:'#8390a2'}}/><input style={{...field,paddingRight:34}} placeholder="ابحث بالاسم أو البريد الإلكتروني..." value={search} onChange={e=>setSearch(e.target.value)}/></div><span style={{fontSize:11,color:'#778399'}}>{filtered.length} حساب</span></div>
      {busy&&!users.length?<p style={{fontSize:12,color:'#778399'}}>جارٍ تحميل الحسابات...</p>:!filtered.length?<div style={{padding:30,textAlign:'center',color:'#8793a5',fontSize:12}}><UserRound size={24}/><p>لا توجد حسابات مطابقة</p></div>:<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:680,fontSize:12}}><thead><tr style={{color:'#8490a1',textAlign:'right'}}>{['الموظف','الصلاحية','الحالة','تاريخ الإنشاء','إجراء'].map(x=><th key={x} style={{padding:'11px 9px',borderBottom:'1px solid #edf0f5',fontWeight:600}}>{x}</th>)}</tr></thead><tbody>{filtered.map(u=><tr key={u.id} style={{borderBottom:'1px solid #f0f2f6'}}><td style={{padding:'13px 9px'}}><b style={{display:'block',color:'#26364c'}}>{u.full_name||'بدون اسم'}</b><span style={{fontSize:10,color:'#8490a1'}}>{u.email}</span></td><td style={{padding:'13px 9px'}}>{u.id===currentUserId?<span>{roleLabel[u.roles[0]]||'مدير النظام'} (أنت)</span>:<select style={{...field,width:135,padding:'7px 8px'}} value={u.roles[0]||'employee'} disabled={busy} onChange={e=>void update(u,{role:e.target.value})}>{Object.entries(roleLabel).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>}</td><td style={{padding:'13px 9px'}}><span style={{color:u.is_active?'#16865a':'#b45309',background:u.is_active?'#eaf8f0':'#fff4e8',padding:'5px 9px',borderRadius:20,fontSize:10}}>{u.is_active?'نشط':'موقوف'}</span></td><td style={{padding:'13px 9px',color:'#7b8798'}}>{new Date(u.created_at).toLocaleDateString('en-GB')}</td><td style={{padding:'13px 9px'}}>{u.id!==currentUserId&&<div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button style={{...button,background:'#eef3fa',color:'#34445d',padding:'7px 10px'}} disabled={busy} onClick={()=>openEdit(u)}><Edit3 size={14}/> تعديل</button><button style={{...button,background:u.is_active?'#fff1f0':'#eaf8f0',color:u.is_active?'#b42318':'#16865a',padding:'7px 10px'}} disabled={busy} onClick={()=>void update(u,{is_active:!u.is_active})}>{u.is_active?<><UserX size={14}/> إيقاف</>:<><ShieldCheck size={14}/> تفعيل</>}</button></div>}</td></tr>)}</tbody></table></div>}
    </section>
    {editing&&createPortal(<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null)}}><div className="modal-card" role="dialog" aria-modal="true" aria-label="تعديل حساب الموظف"><div className="modal-head"><div><h2>تعديل حساب الموظف</h2><p>{editing.email}</p></div><button type="button" className="icon-btn" onClick={()=>setEditing(null)}>×</button></div><form onSubmit={saveEdit} style={{padding:20,display:'grid',gap:13,maxWidth:650,margin:'0 auto',width:'100%'}}><label style={{fontSize:11,color:'#64748b'}}>الاسم الكامل<input style={{...field,marginTop:6}} value={editName} onChange={e=>setEditName(e.target.value)} required/></label><label style={{fontSize:11,color:'#64748b'}}>البريد الإلكتروني<input style={{...field,marginTop:6}} type="email" value={editEmail} onChange={e=>setEditEmail(e.target.value)} required/></label><label style={{fontSize:11,color:'#64748b'}}>كلمة مرور جديدة (اختياري)<input style={{...field,marginTop:6}} type="password" value={editPassword} onChange={e=>setEditPassword(e.target.value)} minLength={8} placeholder="اتركها فارغة للإبقاء على الحالية" autoComplete="new-password"/></label><p style={{fontSize:10,color:'#7b8798',margin:0}}>يمكنك تعديل الاسم والبريد الإلكتروني أو تعيين كلمة مرور جديدة. تغيير البريد قد يتطلب تأكيداً حسب إعدادات المصادقة.</p><div className="modal-actions" style={{display:'flex',justifyContent:'flex-end',gap:8}}><button type="button" style={{...button,background:'#eef2f8',color:'#34445d'}} onClick={()=>setEditing(null)}>إلغاء</button><button type="submit" style={button} disabled={busy}>حفظ التعديلات</button></div></form></div></div>,document.body)}
    <p style={{fontSize:10,color:'#8793a5',display:'flex',alignItems:'center',gap:6}}><ShieldCheck size={13}/> إدارة الحسابات متاحة لمدير النظام فقط. لا يتم حذف حساب الموظف أو سجلاته عند إيقافه.</p>
  </div>
}