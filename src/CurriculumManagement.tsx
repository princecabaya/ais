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
 const [units,setUnits]=useState('');
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
 async function confirmUnits(e:FormEvent){
  e.preventDefault();if(editId===null||!supabase)return;setBusy(true);setMessage('');
  const {error}=await supabase.rpc('admin_confirm_course_units',{p_course_id:editId,p_units:Number(units),p_reason:reason.trim()});
  if(error)setMessage(error.message);
  else{setMessage('Units saved with an administrator audit record.');setEditId(null);setReason('');await load();}
  setBusy(false);
 }
 return <section className="panel curriculum-module" id="curriculum-management">
  <div className="curriculum-heading"><div><span className="kicker">ACADEMIC ADMINISTRATION</span><h2>Curriculum Management</h2><p>Imported prospectuses, approved block mappings, and course verification.</p></div><button type="button" className="ghost" onClick={()=>void load()}>Refresh catalog</button></div>
  <div className="curriculum-metrics"><div><strong>{catalog.length}</strong><span>Curricula</span></div><div><strong>{courses.length}</strong><span>Prospectus entries</span></div><div><strong>{sections.length}</strong><span>Active blocks</span></div><div><strong>{offerings.length}</strong><span>Course offerings</span></div></div>
  <p className="curriculum-note">Current term: {live?live.academic_year+' · Semester '+live.semester:'No active term'} · Entries flagged for verification cannot be assigned until reviewed.</p>
  <div className="curriculum-tabs">{(['courses','sections','review'] as const).map(t=><button key={t} type="button" className={tab===t?'curriculum-tab selected':'curriculum-tab'} onClick={()=>setTab(t)}>{t==='courses'?'Course Catalog':t==='sections'?'11 Student Blocks':'Needs Review'}{t==='review'?' ('+flagged.length+')':''}</button>)}</div>
  {loading?<p>Loading curriculum catalog…</p>:tab==='courses'?<>
   <div className="curriculum-filters"><label>Curriculum<select value={selected} onChange={e=>setSelected(e.target.value)}>{catalog.map(c=><option value={c.id} key={c.id}>{c.title} ({c.effective_year})</option>)}</select></label><label>Year<select value={year} onChange={e=>setYear(e.target.value)}>{[1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>Semester<select value={semester} onChange={e=>setSemester(e.target.value)}><option value="1">First</option><option value="2">Second</option></select></label></div>
   <p className="curriculum-note">{visible.length} courses · {visible.reduce((s,c)=>s+(c.units??0),0)} verified/known units shown in this selection (excluding missing values)</p>
   <div className="curriculum-table-wrap"><table className="curriculum-table"><thead><tr><th>Code</th><th>Course title</th><th>Units</th><th>Prerequisite</th><th>Status</th></tr></thead><tbody>{visible.map(c=><tr key={c.id}><td><strong>{c.course_code}</strong></td><td>{c.course_title}</td><td>{c.units??'—'}</td><td>{c.prerequisite_text||'—'}</td><td>{c.verification_status==='verified'?'Verified':'Review required'}</td></tr>)}</tbody></table></div>
  </>:tab==='sections'?<div className="curriculum-table-wrap"><table className="curriculum-table"><thead><tr><th>Student block</th><th>Program</th><th>Curriculum</th><th>Offerings</th></tr></thead><tbody>{sections.map(s=><tr key={s.id}><td><strong>{s.block_label}</strong></td><td>{s.program}</td><td>{catalog.find(c=>c.id===s.curriculum_id)?.title||s.curriculum_id}</td><td>{offerings.filter(o=>o.class_section_id===s.id).length}</td></tr>)}</tbody></table></div>:<div className="curriculum-review">{flagged.length?flagged.map(c=><div key={c.id} className="curriculum-review-row"><div><strong>{c.course_code} — {c.course_title}</strong><p>{catalog.find(x=>x.id===c.curriculum_id)?.title} · Year {c.year_level} · Sem {c.semester} · Prospectus row {c.source_row}</p><small>Reason: {c.verification_status==='review_units'?'Units not visible in extracted source cell':'Details need verification against source prospectus'}</small></div>{c.verification_status==='review_units'&&<button className="ghost" type="button" onClick={()=>{setEditId(c.id);setUnits('');setReason('')}}>Confirm units</button>}</div>):<p>No flagged entries.</p>}</div>}
  {editId!==null&&<form className="curriculum-correction" onSubmit={confirmUnits}><h3>Confirm missing units</h3><p>Check the official approved prospectus before recording a unit value. Your reason is retained in the audit log.</p><label>Units<input type="number" min="0.5" max="12" step="0.5" required value={units} onChange={e=>setUnits(e.target.value)}/></label><label>Justification / supporting source<input minLength={8} required value={reason} onChange={e=>setReason(e.target.value)} placeholder="Verified against signed curriculum copy"/></label><div className="curriculum-actions"><button disabled={busy} className="primary" type="submit">Save verified units</button><button className="ghost" type="button" onClick={()=>setEditId(null)}>Cancel</button></div></form>}
  {message&&<div className="notice" role="status">{message}</div>}
 </section>
}
