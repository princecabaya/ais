import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from './supabase';

type Section={id:string;block_label:string;program:string;year_level:number;track:string|null};
type Course={id:number;course_code:string;course_title:string;units:number|null;verification_status:string};
type Offering={id:number;academic_term_id:number;class_section_id:string;curriculum_course_id:number;status:string};
type Term={id:number;academic_year:string;semester:number;is_active:boolean};
type Request={id:number;academic_term_id:number;course_offering_id:number;faculty_id:string;preference_rank:number;motivation:string|null;status:'pending'|'approved'|'rejected'|'withdrawn';requested_at:string;decision_note:string|null;decided_at:string|null};
type Faculty={id:string;first_name:string;last_name:string;department:string;employment_type:string};
type Notice={id:number;title:string;body:string;created_at:string};

export function CourseSelection({facultyId,isAdmin}:{facultyId:string;isAdmin:boolean}){
 const [terms,setTerms]=useState<Term[]>([]);
 const [sections,setSections]=useState<Section[]>([]);
 const [courses,setCourses]=useState<Course[]>([]);
 const [offerings,setOfferings]=useState<Offering[]>([]);
 const [requests,setRequests]=useState<Request[]>([]);
 const [faculty,setFaculty]=useState<Faculty[]>([]);
 const [notices,setNotices]=useState<Notice[]>([]);
 const [program,setProgram]=useState('ALL');
 const [section,setSection]=useState('ALL');
 const [search,setSearch]=useState('');
 const [rank,setRank]=useState<Record<number,number>>({});
 const [motivation,setMotivation]=useState<Record<number,string>>({});
 const [decisionNote,setDecisionNote]=useState<Record<number,string>>({});
 const [tab,setTab]=useState<'browse'|'requests'|'admin'>('browse');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const active=terms.find(t=>t.is_active);
 const load=useCallback(async()=>{
  if(!supabase)return;setLoading(true);
  const calls=[
   supabase.from('academic_terms').select('id,academic_year,semester,is_active'),
   supabase.from('class_sections').select('id,block_label,program,year_level,track').eq('active',true),
   supabase.from('curriculum_courses').select('id,course_code,course_title,units,verification_status'),
   supabase.from('course_offerings').select('id,academic_term_id,class_section_id,curriculum_course_id,status'),
   supabase.from('faculty_course_requests').select('id,academic_term_id,course_offering_id,faculty_id,preference_rank,motivation,status,requested_at,decision_note,decided_at').order('requested_at',{ascending:false}),
   supabase.from('faculty_notifications').select('id,title,body,created_at').order('created_at',{ascending:false}).limit(6)
  ];
  const [results,people]=await Promise.all([Promise.all(calls),isAdmin?supabase.from('profiles').select('id,first_name,last_name,department,employment_type'):Promise.resolve(null)]);
  const error=results.find(r=>r.error)?.error || people?.error;
  if(error)setMessage(error.message);
  else{
   setTerms(results[0].data as Term[]||[]);
   setSections(results[1].data as Section[]||[]);
   setCourses(results[2].data as Course[]||[]);
   setOfferings(results[3].data as Offering[]||[]);
   setRequests(results[4].data as Request[]||[]);
   setNotices(results[5].data as Notice[]||[]);
   if(isAdmin)setFaculty((people?.data || []) as Faculty[]);
  }
  setLoading(false);
 },[isAdmin]);
 useEffect(()=>{void load()},[load]);
 const courseById=useMemo(()=>new Map(courses.map(c=>[c.id,c])),[courses]);
 const sectionById=useMemo(()=>new Map(sections.map(s=>[s.id,s])),[sections]);
 const offeringById=useMemo(()=>new Map(offerings.map(o=>[o.id,o])),[offerings]);
 const facultyById=useMemo(()=>new Map(faculty.map(f=>[f.id,f])),[faculty]);
 const offeringText=(id:number)=>{const o=offeringById.get(id);if(!o)return 'Unavailable course';const c=courseById.get(o.curriculum_course_id);const s=sectionById.get(o.class_section_id);return (c?.course_code||'Course')+' — '+(s?.block_label||'Section');};
 const myRequests=requests.filter(r=>r.faculty_id===facultyId);
 const pending=requests.filter(r=>r.status==='pending'&&(!active||r.academic_term_id===active.id));
 const choices=offerings.filter(o=>{
  if(o.status!=='available'||o.academic_term_id!==active?.id)return false;
  const c=courseById.get(o.curriculum_course_id),s=sectionById.get(o.class_section_id);
  if(!c||!s||c.verification_status!=='verified')return false;
  if(program!=='ALL'&&s.program!==program)return false;
  if(section!=='ALL'&&s.id!==section)return false;
  const q=search.toLowerCase().trim();
  return !q||[c.course_code,c.course_title,s.block_label].some(x=>x.toLowerCase().includes(q));
 }).sort((a,b)=>{
  const sa=sectionById.get(a.class_section_id)?.block_label||'',sb=sectionById.get(b.class_section_id)?.block_label||'';
  return sa.localeCompare(sb)||((courseById.get(a.curriculum_course_id)?.course_code||'').localeCompare(courseById.get(b.curriculum_course_id)?.course_code||''));
 });
 function myLive(id:number){return myRequests.find(r=>r.course_offering_id===id&&(r.status==='pending'||r.status==='approved'))}
 function allocated(id:number){return requests.some(r=>r.course_offering_id===id&&r.status==='approved')}
 async function requestCourse(e:FormEvent,id:number){
  e.preventDefault();if(!supabase)return;setBusy(true);setMessage('');
  const {error}=await supabase.rpc('request_course_preference',{p_offering_id:id,p_rank:rank[id]||1,p_motivation:motivation[id]?.trim()||null});
  if(error)setMessage(error.message);else{setMessage('Preference submitted for administrator consideration. No teaching assignment has been made yet.');await load();}
  setBusy(false);
 }
 async function withdraw(id:number){
  if(!supabase||!window.confirm('Withdraw this pending course preference?'))return;
  setBusy(true);setMessage('');
  const {error}=await supabase.rpc('withdraw_course_preference',{p_request_id:id});
  if(error)setMessage(error.message);else{setMessage('Request withdrawn.');await load();}
  setBusy(false);
 }
 async function decide(id:number,approve:boolean){
  if(!supabase)return;const note=decisionNote[id]?.trim()||'';
  if(note.length<5){setMessage('Enter at least five characters explaining the decision.');return;}
  setBusy(true);setMessage('');
  const {error}=await supabase.rpc('decide_course_preference',{p_request_id:id,p_approve:approve,p_note:note});
  if(error)setMessage(error.message);else{setMessage('Decision recorded and the instructor notified in the portal.');await load();}
  setBusy(false);
 }
 return <section className="panel course-selection" id="course-selection">
  <div className="selection-top">
   <div><span className="kicker">PHASE 2 · FACULTY COURSE PREFERENCES</span><h2>Course Selection</h2><p>Browse BEEd and BSE sections, rank preferred courses, and submit requests. Final allocation belongs to the campus administrator.</p></div>
   <button className="ghost" type="button" onClick={()=>void load()}>Refresh</button>
  </div>
  <div className="selection-metrics">
   <div><strong>{choices.length}</strong><span>Matching offerings</span></div>
   <div><strong>{myRequests.filter(r=>r.status==='pending').length}</strong><span>My pending requests</span></div>
   <div><strong>{myRequests.filter(r=>r.status==='approved').length}</strong><span>My approvals</span></div>
   {isAdmin&&<div><strong>{pending.length}</strong><span>Awaiting admin</span></div>}
  </div>
  <p className="curriculum-note">{active?active.academic_year+' · Semester '+active.semester:'No active academic term'}. Each student block has its own independent offering. Requests do not reserve rooms or time slots.</p>
  <div className="curriculum-tabs">
   <button type="button" className={tab==='browse'?'curriculum-tab selected':'curriculum-tab'} onClick={()=>setTab('browse')}>Browse courses</button>
   <button type="button" className={tab==='requests'?'curriculum-tab selected':'curriculum-tab'} onClick={()=>setTab('requests')}>My requests ({myRequests.length})</button>
   {isAdmin&&<button type="button" className={tab==='admin'?'curriculum-tab selected':'curriculum-tab'} onClick={()=>setTab('admin')}>Admin review ({pending.length})</button>}
  </div>
  {loading?<p>Loading current course offerings…</p>:tab==='browse'?<>
   <div className="selection-filters"><label>Program<select value={program} onChange={e=>{setProgram(e.target.value);setSection('ALL')}}><option value="ALL">Both programs</option><option value="BEEd">BEEd</option><option value="BSE">BSE</option></select></label><label>Student block<select value={section} onChange={e=>setSection(e.target.value)}><option value="ALL">All blocks</option>{sections.filter(s=>program==='ALL'||s.program===program).map(s=><option key={s.id} value={s.id}>{s.block_label}</option>)}</select></label><label>Search<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Course code or title"/></label></div>
   <div className="offering-grid">{choices.map(o=>{const c=courseById.get(o.curriculum_course_id)!,s=sectionById.get(o.class_section_id)!;const my=myLive(o.id),isAllocated=allocated(o.id);return <article className="offering-card" key={o.id}>
    <div className="offering-heading"><strong>{c.course_code}</strong><span>{s.program}</span></div>
    <h3>{c.course_title}</h3><p>{s.block_label} · {c.units??'—'} units</p>
    {my?<div className="selection-tag">Your request: {my.status} · Rank {my.preference_rank}</div>:isAllocated?<div className="selection-tag">Already allocated</div>:<form onSubmit={e=>void requestCourse(e,o.id)}>
     <label>Preference rank<select value={rank[o.id]||1} onChange={e=>setRank(prev=>({...prev,[o.id]:Number(e.target.value)}))}>{Array.from({length:10},(_,i)=><option value={i+1} key={i}>{i+1} — {i===0?'highest priority':'priority '+(i+1)}</option>)}</select></label>
     <label>Qualification / teaching preference (optional)<input maxLength={1000} value={motivation[o.id]||''} onChange={e=>setMotivation(prev=>({...prev,[o.id]:e.target.value}))} placeholder="Related expertise or experience"/></label>
     <button className="primary" type="submit" disabled={busy}>Request this course</button>
    </form>}
   </article>})}</div>
   {choices.length===0&&<p>No available offerings match these filters.</p>}
  </>:tab==='requests'?<div className="selection-rows">{myRequests.length?myRequests.map(r=><div className="selection-row" key={r.id}><div><strong>{offeringText(r.course_offering_id)}</strong><p>Rank {r.preference_rank} · {r.status} · {new Date(r.requested_at).toLocaleDateString()}</p>{r.decision_note&&<small>Admin decision: {r.decision_note}</small>}</div>{r.status==='pending'&&<button className="ghost" type="button" disabled={busy} onClick={()=>void withdraw(r.id)}>Withdraw</button>}</div>):<p>No requests submitted yet.</p>}</div>:<div className="selection-rows">{pending.length?pending.map(r=>{const f=facultyById.get(r.faculty_id);return <div key={r.id} className="selection-row admin-decision"><div><strong>{offeringText(r.course_offering_id)}</strong><p>{f?f.first_name+' '+f.last_name:'Instructor '+r.faculty_id.slice(0,8)} · Rank {r.preference_rank} · {f?.department||'—'} · {f?.employment_type||'—'}</p><small>Stated qualification: {r.motivation||'Not supplied. Review qualifications manually.'}</small><p>Current competing requests: {pending.filter(x=>x.course_offering_id===r.course_offering_id).length}</p></div><div className="decision-controls"><label>Decision reason<input value={decisionNote[r.id]||''} onChange={e=>setDecisionNote(prev=>({...prev,[r.id]:e.target.value}))} placeholder="Qualification and staffing rationale"/></label><div><button className="primary" type="button" disabled={busy} onClick={()=>void decide(r.id,true)}>Approve</button><button className="ghost" type="button" disabled={busy} onClick={()=>void decide(r.id,false)}>Decline</button></div></div></div>;}):<p>No pending requests to review.</p>}</div>}
  {notices.length>0&&<div className="selection-notifications"><h3>Your recent notifications</h3>{notices.map(n=><p key={n.id}><strong>{n.title}</strong> — {n.body}</p>)}</div>}
  {message&&<div className="notice" role="status">{message}</div>}
 </section>
}
