import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from './supabase';
import { CourseScheduleWizard, type ScheduleChoice } from './CourseScheduleWizard';

type Section={id:string;block_label:string;program:string;year_level:number;track:string|null};
type Course={id:number;course_code:string;course_title:string;units:number|null;verification_status:string};
type Offering={id:number;academic_term_id:number;class_section_id:string;curriculum_course_id:number;status:string};
type Term={id:number;academic_year:string;semester:number;is_active:boolean};
type Request={id:number;academic_term_id:number;course_offering_id:number;faculty_id:string;preference_rank:number;motivation:string|null;status:'pending'|'approved'|'rejected'|'withdrawn';requested_at:string;decision_note:string|null;decided_at:string|null;preferred_pattern:string|null;preferred_start_minute:number|null;preferred_pathfit_weekday:number|null;preferred_venue_id:number|null};
type Venue={id:number;name:string};
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
 const [year,setYear]=useState('ALL');
 const [sortBy,setSortBy]=useState<'block'|'code'|'title'>('block');
 const [selectedCourseId,setSelectedCourseId]=useState<number|null>(null);
 const [venues,setVenues]=useState<Venue[]>([]);
 const [collapsedBlocks,setCollapsedBlocks]=useState<string[]>([]);
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
   supabase.from('faculty_course_requests').select('id,academic_term_id,course_offering_id,faculty_id,preference_rank,motivation,status,requested_at,decision_note,decided_at,preferred_pattern,preferred_start_minute,preferred_pathfit_weekday,preferred_venue_id').order('requested_at',{ascending:false}),
   supabase.from('faculty_notifications').select('id,title,body,created_at').order('created_at',{ascending:false}).limit(6),
   supabase.from('schedule_venues').select('id,name').eq('active',true)
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
   setVenues(results[6].data as Venue[]||[]);
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
  if(year!=='ALL'&&s.year_level!==Number(year))return false;
  if(section!=='ALL'&&s.id!==section)return false;
  const q=search.toLowerCase().trim();
  return !q||[c.course_code,c.course_title,s.block_label].some(x=>x.toLowerCase().includes(q));
 }).sort((a,b)=>{
  const sa=sectionById.get(a.class_section_id)?.block_label||'',sb=sectionById.get(b.class_section_id)?.block_label||'';
  const ca=courseById.get(a.curriculum_course_id),cb=courseById.get(b.curriculum_course_id);
  if(sortBy==='code')return (ca?.course_code||'').localeCompare(cb?.course_code||'')||sa.localeCompare(sb);
  if(sortBy==='title')return (ca?.course_title||'').localeCompare(cb?.course_title||'')||sa.localeCompare(sb);
  return sa.localeCompare(sb,undefined,{numeric:true})||(ca?.course_code||'').localeCompare(cb?.course_code||'');
 });
 const choiceGroups=sections.filter(sec=>choices.some(o=>o.class_section_id===sec.id)).sort((a,b)=>a.program.localeCompare(b.program)||a.year_level-b.year_level||a.block_label.localeCompare(b.block_label,undefined,{numeric:true})).map(sec=>({section:sec,items:choices.filter(o=>o.class_section_id===sec.id)}));
 function myLive(id:number){return myRequests.find(r=>r.course_offering_id===id&&(r.status==='pending'||r.status==='approved'))}
 function allocated(id:number){return requests.some(r=>r.course_offering_id===id&&r.status==='approved')}
 async function requestCourseWithSchedule(id:number,choice:ScheduleChoice,priority:number,note:string){
  if(!supabase)return;setBusy(true);setMessage('');
  const {error}=await supabase.rpc('request_course_with_schedule',{
   p_offering_id:id,p_rank:priority,p_motivation:note||null,
   p_pattern:choice.pattern,p_start_minute:choice.start,p_venue_id:choice.venueId,p_pathfit_day:choice.day
  });
  if(error)setMessage(error.message);
  else{setMessage('Course, schedule and preferred room submitted for approval. No room has been reserved.');setSelectedCourseId(null);await load();}
  setBusy(false);
 }
 const chosenOffering=offerings.find(o=>o.id===selectedCourseId);
 const chosenCourse=chosenOffering?courseById.get(chosenOffering.curriculum_course_id):undefined;
 const chosenSection=chosenOffering?sectionById.get(chosenOffering.class_section_id):undefined;
 const timeLabel=(r:Request)=>{
  if(!r.preferred_pattern||r.preferred_start_minute===null)return 'No meeting preference recorded';
  const days=r.preferred_pattern==='MW'?'Mon/Wed':r.preferred_pattern==='TTH'?'Tue/Thu':r.preferred_pattern==='NSTP'?'Friday':['','Monday','Tuesday','Wednesday','Thursday','Friday'][r.preferred_pathfit_weekday||0]||'Weekday';
  const h=(n:number)=>{const hr=Math.floor(n/60);return ((hr+11)%12+1)+':'+String(n%60).padStart(2,'0')+(hr>=12?' PM':' AM')};
  return days+' · '+h(r.preferred_start_minute)+' · '+(venues.find(v=>v.id===r.preferred_venue_id)?.name||'Venue');
 };
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
   <div className="selection-browser">
    <div className="selection-browser-heading"><div><h3>Find your teaching subjects</h3><p>Choose a program and year level, then open a student block. Each block is requested independently.</p></div><button type="button" className="ghost" onClick={()=>{setProgram('ALL');setYear('ALL');setSection('ALL');setSearch('');setSortBy('block');setCollapsedBlocks([]);setSelectedCourseId(null)}}>Reset filters</button></div>
    <div className="selection-program-choices" role="group" aria-label="Filter program">
     {[{value:'ALL',label:'All programs'},{value:'BEEd',label:'BEEd · Elementary Education'},{value:'BSE',label:'BSE · Entrepreneurship'}].map(p=><button type="button" key={p.value} className={program===p.value?'program-filter active':'program-filter'} onClick={()=>{setProgram(p.value);setYear('ALL');setSection('ALL');setSelectedCourseId(null)}}>{p.label}<small>{offerings.filter(o=>o.academic_term_id===active?.id&&o.status==='available'&&courseById.get(o.curriculum_course_id)?.verification_status==='verified'&&(p.value==='ALL'||sectionById.get(o.class_section_id)?.program===p.value)).length} offerings</small></button>)}
    </div>
    <div className="selection-filters">
     <label>Year level<select value={year} onChange={e=>{setYear(e.target.value);setSection('ALL')}}><option value="ALL">All year levels</option>{[1,2,3,4].map(n=><option value={n} key={n}>Year {n}</option>)}</select></label>
     <label>Student block<select value={section} onChange={e=>setSection(e.target.value)}><option value="ALL">All student blocks</option>{sections.filter(s=>(program==='ALL'||s.program===program)&&(year==='ALL'||s.year_level===Number(year))).sort((a,b)=>a.program.localeCompare(b.program)||a.year_level-b.year_level||a.block_label.localeCompare(b.block_label,undefined,{numeric:true})).map(s=><option key={s.id} value={s.id}>{s.block_label}</option>)}</select></label>
     <label>Search subjects<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Code, title, or block" type="search"/></label>
     <label>Sort results<select value={sortBy} onChange={e=>setSortBy(e.target.value as 'block'|'code'|'title')}><option value="block">Student block</option><option value="code">Course code</option><option value="title">Course title</option></select></label>
    </div>
    <div className="selection-browser-summary"><strong>{choices.length}</strong> matching course offerings across <strong>{choiceGroups.length}</strong> student blocks. <span>All programs remain available for cross-program teaching requests.</span></div>
    {choiceGroups.map(group=>{const isCollapsed=collapsedBlocks.includes(group.section.id);return <section className="course-block-group" key={group.section.id}>
     <button type="button" className="course-block-heading" aria-expanded={!isCollapsed} onClick={()=>{setCollapsedBlocks(prev=>isCollapsed?prev.filter(id=>id!==group.section.id):[...prev,group.section.id]);setSelectedCourseId(null)}}>
      <span><strong>{group.section.block_label}</strong><small>{group.section.program} · Year {group.section.year_level}{group.section.track?' · '+group.section.track:''}</small></span><span className="course-block-count">{group.items.length} subjects {isCollapsed?'＋':'−'}</span>
     </button>
     {!isCollapsed&&<div className="course-block-list">{group.items.map(o=>{const c=courseById.get(o.curriculum_course_id)!,my=myLive(o.id),isAllocated=allocated(o.id);return <article className="course-list-row" key={o.id}>
      <div className="course-list-row-main">
       <div className="course-list-code">{c.course_code}</div>
       <div className="course-list-description"><strong>{c.course_title}</strong><small>{c.units??'—'} units · {group.section.block_label}</small></div>
       <div className="course-list-action">{my?<span className="selection-tag">{my.status} · Rank {my.preference_rank}</span>:isAllocated?<span className="selection-tag">Allocated</span>:<button type="button" className="primary" disabled={busy} onClick={()=>setSelectedCourseId(o.id)}>Select course</button>}</div>
      </div>

     </article>})}</div>}
    </section>})}
    {!choices.length&&<p className="selection-empty">No offerings match these filters. Change the year, block, or search keyword to see more subjects.</p>}
   </div>
  </>:tab==='requests'?<div className="selection-rows">{myRequests.length?myRequests.map(r=><div className="selection-row" key={r.id}><div><strong>{offeringText(r.course_offering_id)}</strong><p>Rank {r.preference_rank} · {r.status} · {new Date(r.requested_at).toLocaleDateString()}</p><small>{timeLabel(r)}</small>{r.decision_note&&<small>Admin decision: {r.decision_note}</small>}</div>{r.status==='pending'&&<button className="ghost" type="button" disabled={busy} onClick={()=>void withdraw(r.id)}>Withdraw</button>}</div>):<p>No requests submitted yet.</p>}</div>:<div className="selection-rows">{pending.length?pending.map(r=>{const f=facultyById.get(r.faculty_id);return <div key={r.id} className="selection-row admin-decision"><div><strong>{offeringText(r.course_offering_id)}</strong><p>{f?f.first_name+' '+f.last_name:'Instructor '+r.faculty_id.slice(0,8)} · Rank {r.preference_rank} · {f?.department||'—'} · {f?.employment_type||'—'}</p><small>Stated qualification: {r.motivation||'Not supplied. Review qualifications manually.'}</small><p>Preferred: {timeLabel(r)}</p><p>Current competing requests: {pending.filter(x=>x.course_offering_id===r.course_offering_id).length}</p></div><div className="decision-controls"><label>Decision reason<input value={decisionNote[r.id]||''} onChange={e=>setDecisionNote(prev=>({...prev,[r.id]:e.target.value}))} placeholder="Qualification and staffing rationale"/></label><div><button className="primary" type="button" disabled={busy} onClick={()=>void decide(r.id,true)}>Approve</button><button className="ghost" type="button" disabled={busy} onClick={()=>void decide(r.id,false)}>Decline</button></div></div></div>;}):<p>No pending requests to review.</p>}</div>}
  {chosenOffering&&chosenCourse&&chosenSection&&<CourseScheduleWizard
    key={chosenOffering.id} code={chosenCourse.course_code} title={chosenCourse.course_title} block={chosenSection.block_label}
    units={chosenCourse.units} rank={rank[chosenOffering.id]||1} motivation={motivation[chosenOffering.id]||''}
    busy={busy} onClose={()=>setSelectedCourseId(null)}
    onSubmit={(choice,priority,note)=>requestCourseWithSchedule(chosenOffering.id,choice,priority,note)}
   />}
  {notices.length>0&&<div className="selection-notifications"><h3>Your recent notifications</h3>{notices.map(n=><p key={n.id}><strong>{n.title}</strong> — {n.body}</p>)}</div>}
  {message&&<div className="notice" role="status">{message}</div>}
 </section>
}
