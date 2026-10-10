import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from './supabase';

type Curriculum={id:string;title:string;program:string;track:string|null;effective_year:string};
type Course={id:number;curriculum_id:string;year_level:number;semester:number;course_code:string;course_title:string;units:number|null;prerequisite_text:string|null;verification_status:string;source_row:number};
type Section={id:string;block_label:string;curriculum_id:string;year_level:number;program:string;track:string|null;active:boolean};
type Offering={class_section_id:string;curriculum_course_id:number;status:string};
type Term={id:number;academic_year:string;semester:number;is_active:boolean};

export function CurriculumManagement(){
 const [catalog,setCatalog]=useState<Curriculum[]>([]);
 const [courses,setCourses]=useState<Course[]>([]);
 const [sections,setSections]=useState<Section[]>([]);
 const [offerings,setOfferings]=useState<Offering[]>([]);
 const [terms,setTerms]=useState<Term[]>([]);
 const [selected,setSelected]=useState('BEED_2025');
 const [year,setYear]=useState('1');
 const [semester,setSemester]=useState('1');
 const [tab,setTab]=useState<'courses'|'sections'|'review'>('courses');
 const [message,setMessage]=useState('');
 const [loading,setLoading]=useState(true);
 const [editId,setEditId]=useState<number|null>(null);
 const [editMode,setEditMode]=useState<'edit'|'new'>('edit');
 const [draft,setDraft]=useState({code:'',title:'',units:'',prerequisite:'',verification:'verified'});
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false);
 async function load(){
  if(!supabase)return;
  setLoading(true);
  const [a,b,c,d,e]=await Promise.all([
   supabase.from('curricula').select('id,title,program,track,effective_year').order('id'),
   supabase.from('curriculum_courses').select('id,curriculum_id,year_level,semester,course_code,course_title,units,prerequisite_text,verification_status,source_row').order('year_level').order('semester').order('source_row'),
   supabase.from('class_sections').select('id,block_label,curriculum_id,year_level,program,track,active').order('id'),
   supabase.from('course_offerings').select('class_section_id,curriculum_course_id,status'),
   supabase.from('academic_terms').select('id,academic_year,semester,is_active').order('academic_year',{ascending:false})
  ]);
  const error=[a,b,c,d,e].find(r=>r.error)?.error;
  if(error)setMessage(error.message);
  else {setCatalog(a.data||[]);setCourses(b.data||[]);setSections(c.data||[]);setOfferings(d.data||[]);setTerms(e.data||[]);}
  setLoading(false);
 }
 useEffect(()=>{void load()},[]);
 const visible=useMemo(()=>courses.filter(c=>c.curriculum_id===selected&&c.year_level===Number(year)&&c.semester===Number(semester)),[courses,selected,year,semester]);
 const flagged=courses.filter(c=>c.verification_status!=='verified');
 const live=terms.find(t=>t.is_active);

 function editCourse(c:Course){
  setEditMode('edit');setEditId(c.id);
  setDraft({code:c.course_code,title:c.course_title,units:c.units===null?'':String(c.units),prerequisite:c.prerequisite_text||'',verification:c.verification_status});
  setReason('');setMessage('');
 }
 function createCourse(){
  setEditMode('new');setEditId(-1);
  setDraft({code:'',title:'',units:'',prerequisite:'',verification:'verified'});
  setReason('');setMessage('');
 }
 async function saveCourse(e:FormEvent){
  e.preventDefault();if(editId===null||!supabase)return;
  if(!window.confirm('Save this curriculum catalog change? It may update the courses shown to faculty.'))return;
  setBusy(true);setMessage('');
  const shared={p_code:draft.code.trim(),p_title:draft.title.trim(),p_units:draft.units===''?null:Number(draft.units),p_prerequisite:draft.prerequisite.trim()||null,p_verification:draft.verification,p_reason:reason.trim()};
  const {error}=editMode==='new'
   ?await supabase.rpc('admin_add_catalog_course',{...shared,p_curriculum_id:selected,p_year:Number(year),p_semester:Number(semester)})
   :await supabase.rpc('admin_edit_catalog_course',{...shared,p_course_id:editId});
  if(error)setMessage(error.message);
  else{setMessage(editMode==='new'?'Course added to its curriculum and semester offerings.':'Catalog correction saved with its audit record.');setEditId(null);setReason('');await load();}
  setBusy(false);
 }
 return <section className="panel curriculum-module" id="curriculum-management">
  <div className="curriculum-heading"><div><span className="kicker">ACADEMIC ADMINISTRATION</span><h2>Curriculum Management</h2><p>Imported prospectuses, approved block mappings, and course verification.</p></div><button type="button" className="ghost" onClick={()=>void load()}>Refresh catalog</button></div>
  <div className="curriculum-metrics"><div><strong>{catalog.length}</strong><span>Curricula</span></div><div><strong>{courses.length}</strong><span>Prospectus entries</span></div><div><strong>{sections.length}</strong><span>Active blocks</span></div><div><strong>{offerings.length}</strong><span>Course offerings</span></div></div>
  <p className="curriculum-note">Current term: {live?live.academic_year+' · Semester '+live.semester:'No active term'} · Entries flagged for verification cannot be assigned until reviewed.</p>
  <div className="curriculum-tabs">{(['courses','sections','review'] as const).map(t=><button key={t} type="button" className={tab===t?'curriculum-tab selected':'curriculum-tab'} onClick={()=>setTab(t)}>{t==='courses'?'Course Catalog':t==='sections'?'11 Student Blocks':'Needs Review'}{t==='review'?' ('+flagged.length+')':''}</button>)}</div>
  {loading?<p>Loading curriculum catalog…</p>:tab==='courses'?<>
   <div className="curriculum-filters"><label>Curriculum<select value={selected} onChange={e=>setSelected(e.target.value)}>{catalog.map(c=><option value={c.id} key={c.id}>{c.title} ({c.effective_year})</option>)}</select></label><label>Year<select value={year} onChange={e=>setYear(e.target.value)}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>Semester<select value={semester} onChange={e=>setSemester(e.target.value)}><option value="1">First</option><option value="2">Second</option></select></label></div>
   <div className="catalog-toolbar"><button type="button" className="primary" onClick={createCourse}>+ Add course to this semester</button><span>Only administrators can change curriculum records.</span></div>
   <p className="curriculum-note">{visible.length} courses · {visible.reduce((s,c)=>s+(c.units??0),0)} verified/known units shown in this selection (excluding missing values)</p>
   <div className="curriculum-table-wrap"><table className="curriculum-table"><thead><tr><th>Code</th><th>Course title</th><th>Units</th><th>Prerequisite</th><th>Status</th><th>Admin action</th></tr></thead><tbody>{visible.map(c=><tr key={c.id}><td><strong>{c.course_code}</strong></td><td>{c.course_title}</td><td>{c.units??'—'}</td><td>{c.prerequisite_text||'—'}</td><td>{c.verification_status==='verified'?'Verified':'Review required'}</td><td><button type='button' className='ghost' onClick={()=>editCourse(c)}>Edit</button></td></tr>)}</tbody></table></div>
  </>:tab==='sections'?<div className="curriculum-table-wrap"><table className="curriculum-table"><thead><tr><th>Student block</th><th>Program</th><th>Curriculum</th><th>Offerings</th></tr></thead><tbody>{sections.map(s=><tr key={s.id}><td><strong>{s.block_label}</strong></td><td>{s.program}</td><td>{catalog.find(c=>c.id===s.curriculum_id)?.title||s.curriculum_id}</td><td>{offerings.filter(o=>o.class_section_id===s.id).length}</td></tr>)}</tbody></table></div>:<div className="curriculum-review">{flagged.length?flagged.map(c=><div key={c.id} className="curriculum-review-row"><div><strong>{c.course_code} — {c.course_title}</strong><p>{catalog.find(x=>x.id===c.curriculum_id)?.title} · Year {c.year_level} · Sem {c.semester} · Prospectus row {c.source_row}</p><small>Reason: {c.verification_status==='review_units'?'Units not visible in extracted source cell':'Details need verification against source prospectus'}</small></div>{c.verification_status==='review_units'&&<button className="ghost" type="button" onClick={()=>editCourse(c)}>Review and edit</button>}</div>):<p>No flagged entries.</p>}</div>}
  {editId!==null&&<div className="catalog-edit-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setEditId(null)}}>
   <form className="catalog-edit-dialog" role="dialog" aria-modal="true" aria-label={editMode==='new'?'Add catalog course':'Edit catalog course'} onSubmit={e=>void saveCourse(e)}>
    <div className="catalog-edit-heading"><div><span className="kicker">ADMINISTRATOR ONLY</span><h3>{editMode==='new'?'Add new course':'Edit existing course'}</h3><p>{catalog.find(x=>x.id===selected)?.title||'Curriculum'} · Year {year} · Semester {semester}</p></div><button type="button" className="ghost" disabled={busy} onClick={()=>setEditId(null)}>Close</button></div>
    <div className="catalog-edit-fields">
     <label>Course code<input required minLength={2} maxLength={80} value={draft.code} onChange={e=>setDraft(d=>({...d,code:e.target.value}))} placeholder="SC-MATH 1"/></label>
     <label>Units<input type="number" min="0" max="12" step=".5" value={draft.units} onChange={e=>setDraft(d=>({...d,units:e.target.value}))} placeholder="Leave blank if unverified"/></label>
     <label className="catalog-wide">Course title<input required minLength={3} maxLength={300} value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></label>
     <label className="catalog-wide">Prerequisite / requirements<input value={draft.prerequisite} onChange={e=>setDraft(d=>({...d,prerequisite:e.target.value}))} placeholder="None or course code"/></label>
     <label>Verification status<select value={draft.verification} onChange={e=>setDraft(d=>({...d,verification:e.target.value}))}><option value="verified">Verified — available for selection</option><option value="review_units">Units require verification</option><option value="review_details">Details require verification</option></select></label>
     <label className="catalog-wide">Justification / official curriculum source<textarea required minLength={10} rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Describe the approved prospectus, memorandum, or correction being applied"/></label>
    </div>
    <p className="curriculum-note">Edits are logged with the administrator's identity. The assigned curriculum, year, and semester of an existing course are not changed here.</p>
    <div className="catalog-edit-actions"><button type="button" className="ghost" onClick={()=>setEditId(null)}>Cancel</button><button type="submit" className="primary" disabled={busy||reason.trim().length<10}>{busy?'Saving…':editMode==='new'?'Add course':'Save catalog changes'}</button></div>
   </form>
  </div>}
  {message&&<div className="notice" role="status">{message}</div>}
 </section>
}
