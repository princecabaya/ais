import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

type Faculty={id:string;first_name:string;last_name:string;department:string;employment_type:string};
type Course={id:number;course_code:string;course_title:string;units:number|null};
type Offering={id:number;class_section_id:string;curriculum_course_id:number};
type Section={id:string;block_label:string};
type Venue={id:number;name:string};
type Request={id:number;faculty_id:string;course_offering_id:number;academic_term_id:number;status:string;preference_rank:number;motivation:string|null;decision_note:string|null};
type Proposal={id:number;academic_term_id:number;faculty_id:string;course_offering_id:number;venue_id:number;meeting_pattern:string;pathfit_weekday:number|null;start_minute:number;duration_minutes:number;status:string;decision_note:string|null};
type Meeting={id:number;proposal_id:number;academic_term_id:number;faculty_id:string;class_section_id:string;venue_id:number;weekday:number;start_minute:number;end_minute:number;active:boolean};
type Publication={academic_term_id:number;published_at:string;publication_note:string;revision:number};
type Term={id:number;academic_year:string;semester:number;is_active:boolean};
type Audit={id:number;action:string;justification:string;recorded_at:string};
const WEEKDAYS=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const STARTS=[450,540,630,780,870,960,1050];
const clock=(n:number)=>{const hour=Math.floor(n/60);return `${((hour+11)%12)+1}:${String(n%60).padStart(2,'0')} ${hour>=12?'PM':'AM'}`};
const patternLabel=(p:Proposal)=>p.meeting_pattern==='FIELD'?'Field placement (no room or fixed class)':p.meeting_pattern==='MW'?'Monday & Wednesday':p.meeting_pattern==='TTH'?'Tuesday & Thursday':p.meeting_pattern==='NSTP'?'Friday':WEEKDAYS[(p.pathfit_weekday??1)-1];
function coursePattern(code:string,units:number|null){const c=code.toUpperCase().replace(/\s+/g,'');return c.startsWith('PATHFIT')?'PATHFIT':c.startsWith('NSTP')?'NSTP':units===3?'MW':'UNSUPPORTED';}

export function AdministratorApproval(){
 const [faculty,setFaculty]=useState<Faculty[]>([]);
 const [courses,setCourses]=useState<Course[]>([]);
 const [offerings,setOfferings]=useState<Offering[]>([]);
 const [sections,setSections]=useState<Section[]>([]);
 const [venues,setVenues]=useState<Venue[]>([]);
 const [requests,setRequests]=useState<Request[]>([]);
 const [proposals,setProposals]=useState<Proposal[]>([]);
 const [meetings,setMeetings]=useState<Meeting[]>([]);
 const [publications,setPublications]=useState<Publication[]>([]);
 const [terms,setTerms]=useState<Term[]>([]);
 const [audit,setAudit]=useState<Audit[]>([]);
 const [tab,setTab]=useState<'overview'|'conflicts'|'publish'>('overview');
 const [editId,setEditId]=useState<number|null>(null);
 const [venueId,setVenueId]=useState('');
 const [pattern,setPattern]=useState('MW');
 const [weekday,setWeekday]=useState(1);
 const [start,setStart]=useState(450);
 const [reason,setReason]=useState('');
 const [publishNote,setPublishNote]=useState('');
 const [message,setMessage]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const term=terms.find(t=>t.is_active);
 const publication=publications.find(p=>p.academic_term_id===term?.id);
 const load=useCallback(async()=>{
  if(!supabase)return;
  setLoading(true);
  const queries=[
   supabase.from('profiles').select('id,first_name,last_name,department,employment_type').eq('status','active'),
   supabase.from('curriculum_courses').select('id,course_code,course_title,units'),
   supabase.from('course_offerings').select('id,class_section_id,curriculum_course_id'),
   supabase.from('class_sections').select('id,block_label'),
   supabase.from('schedule_venues').select('id,name').eq('active',true).order('name'),
   supabase.from('faculty_course_requests').select('id,faculty_id,course_offering_id,academic_term_id,status,preference_rank,motivation,decision_note'),
   supabase.from('schedule_proposals').select('id,academic_term_id,faculty_id,course_offering_id,venue_id,meeting_pattern,pathfit_weekday,start_minute,duration_minutes,status,decision_note'),
   supabase.from('schedule_meetings').select('id,proposal_id,academic_term_id,faculty_id,class_section_id,venue_id,weekday,start_minute,end_minute,active').eq('active',true),
   supabase.from('schedule_publications').select('academic_term_id,published_at,publication_note,revision'),
   supabase.from('academic_terms').select('id,academic_year,semester,is_active'),
   supabase.from('schedule_admin_audit').select('id,action,justification,recorded_at').order('recorded_at',{ascending:false}).limit(15)
  ];
  const results=await Promise.all(queries);
  const error=results.find(r=>r.error)?.error;
  if(error)setMessage(error.message);
  else{
   setFaculty((results[0].data||[]) as Faculty[]);
   setCourses((results[1].data||[]) as Course[]);
   setOfferings((results[2].data||[]) as Offering[]);
   setSections((results[3].data||[]) as Section[]);
   setVenues((results[4].data||[]) as Venue[]);
   setRequests((results[5].data||[]) as Request[]);
   setProposals((results[6].data||[]) as Proposal[]);
   setMeetings((results[7].data||[]) as Meeting[]);
   setPublications((results[8].data||[]) as Publication[]);
   setTerms((results[9].data||[]) as Term[]);
   setAudit((results[10].data||[]) as Audit[]);
  }
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 const fMap=useMemo(()=>new Map(faculty.map(f=>[f.id,f])),[faculty]);
 const cMap=useMemo(()=>new Map(courses.map(c=>[c.id,c])),[courses]);
 const oMap=useMemo(()=>new Map(offerings.map(o=>[o.id,o])),[offerings]);
 const sMap=useMemo(()=>new Map(sections.map(s=>[s.id,s])),[sections]);
 const vMap=useMemo(()=>new Map(venues.map(v=>[v.id,v])),[venues]);
 const profName=(id:string)=>{const f=fMap.get(id);return f?`${f.last_name}, ${f.first_name}`:'Unknown faculty'};
 const courseText=(id:number)=>{const o=oMap.get(id);if(!o)return 'Missing offering';const c=cMap.get(o.curriculum_course_id);return `${c?.course_code??'Course'} · ${sMap.get(o.class_section_id)?.block_label??'Block'}`};
 const published=proposals.filter(p=>p.academic_term_id===term?.id&&p.status==='approved');
 const pendingAssignments=requests.filter(r=>r.academic_term_id===term?.id&&r.status==='pending');
 const pendingSchedules=proposals.filter(p=>p.academic_term_id===term?.id&&p.status==='pending');
 const activeMeetings=meetings.filter(m=>m.academic_term_id===term?.id);
 const unresolved=useMemo(()=>{
  const issues:{kind:string;details:string}[]=[];
  for(let i=0;i<activeMeetings.length;i++)for(let j=i+1;j<activeMeetings.length;j++){
   const a=activeMeetings[i],b=activeMeetings[j];
   if(a.weekday!==b.weekday||a.start_minute>=b.end_minute||a.end_minute<=b.start_minute)continue;
   const problems=[];
   if(a.faculty_id===b.faculty_id)problems.push('faculty');
   if(a.venue_id===b.venue_id)problems.push('venue');
   if(a.class_section_id===b.class_section_id)problems.push('student block');
   if(problems.length)issues.push({kind:'Published overlap',details:`${WEEKDAYS[a.weekday-1]}: ${problems.join(', ')} · ${courseText(proposals.find(p=>p.id===a.proposal_id)?.course_offering_id??-1)} and ${courseText(proposals.find(p=>p.id===b.proposal_id)?.course_offering_id??-1)}`});
  }
  return issues;
 },[activeMeetings,proposals,term?.id,offerings,courses,sections]);
 const editing=published.find(p=>p.id===editId);
 const editingCourse=editing?cMap.get(oMap.get(editing.course_offering_id)?.curriculum_course_id??-1):undefined;
 const kind=editingCourse?coursePattern(editingCourse.course_code,editingCourse.units):'MW';
 const effectivePattern=kind==='NSTP'?'NSTP':kind==='PATHFIT'?'PATHFIT':pattern;
 const duration=effectivePattern==='NSTP'?180:effectivePattern==='PATHFIT'?120:90;
 const validStarts=STARTS.filter(n=>n+duration<=1140&&!(n<720&&n+duration>780));
 function openRevision(p:Proposal){
  setEditId(p.id);setVenueId(String(p.venue_id));setPattern(p.meeting_pattern);
  setWeekday(p.pathfit_weekday??1);setStart(p.start_minute);setReason('');setMessage('');
 }
 async function move(){
  if(!supabase||!editing)return;setBusy(true);setMessage('');
  const {error}=await supabase.rpc('admin_move_published_schedule',{
   p_proposal_id:editing.id,p_venue_id:Number(venueId),p_pattern:effectivePattern,
   p_start_minute:validStarts.includes(start)?start:(validStarts[0]??450),
   p_pathfit_weekday:effectivePattern==='PATHFIT'?weekday:null,p_justification:reason.trim()
  });
  if(error)setMessage(error.message);
  else{setMessage('Approved sessions rescheduled. Publish the updated timetable again before faculty can see it.');setEditId(null);await load();}
  setBusy(false);
 }
 async function publish(){
  if(!supabase)return;setBusy(true);setMessage('');
  const {error}=await supabase.rpc('admin_publish_schedule',{p_justification:publishNote.trim()});
  if(error)setMessage(error.message);
  else{setMessage('Official timetable published.');setPublishNote('');await load();}
  setBusy(false);
 }
 return <section className="panel admin-approval" id="administrator-approval">
  <div className="selection-top"><div><span className="kicker">ADMINISTRATOR · CENTRAL APPROVAL</span><h2>Approval and Publication Center</h2><p>Review allocation activity, resolve approved-schedule conflicts, and publish the campus timetable.</p></div><button type="button" className="ghost" onClick={()=>void load()}>Refresh</button></div>
  <p className="curriculum-note">{term?`${term.academic_year} · Semester ${term.semester}`:'No active semester'} · Publication status: <strong>{publication?`Published · revision ${publication.revision}`:'Unpublished draft'}</strong></p>
  <div className="selection-metrics">
   <div><strong>{pendingAssignments.length}</strong><span>Course requests awaiting approval</span></div>
   <div><strong>{pendingSchedules.length}</strong><span>Schedule proposals awaiting approval</span></div>
   <div><strong>{published.length}</strong><span>Approved course schedules</span></div>
   <div><strong>{unresolved.length}</strong><span>Detected published overlaps</span></div>
  </div>
  <div className="curriculum-tabs">
   <button className={tab==='overview'?'curriculum-tab selected':'curriculum-tab'} onClick={()=>setTab('overview')}>Overview</button>
   <button className={tab==='conflicts'?'curriculum-tab selected':'curriculum-tab'} onClick={()=>setTab('conflicts')}>Resolve and reschedule</button>
   <button className={tab==='publish'?'curriculum-tab selected':'curriculum-tab'} onClick={()=>setTab('publish')}>Publish timetable</button>
  </div>
  {loading?<p>Loading administrative records…</p>:tab==='overview'?<>
   <div className="admin-approval-columns">
    <div><h3>Pending course allocations</h3>{pendingAssignments.length?pendingAssignments.map(r=><div className="admin-review-item" key={r.id}><strong>{courseText(r.course_offering_id)}</strong><p>{profName(r.faculty_id)} · Preference #{r.preference_rank}</p><small>{r.motivation||'No qualification statement supplied'}</small></div>):<p>No outstanding course requests.</p>}<p className="curriculum-note">Approve or reject these in Course Selection → Admin review. Qualifications are advisory; the administrator makes the decision.</p></div>
    <div><h3>Pending room schedules</h3>{pendingSchedules.length?pendingSchedules.map(p=><div className="admin-review-item" key={p.id}><strong>{courseText(p.course_offering_id)}</strong><p>{profName(p.faculty_id)} · {patternLabel(p)} · {p.meeting_pattern==='FIELD'?'No room required':clock(p.start_minute)+' · '+(vMap.get(p.venue_id)?.name||'Venue')}</p></div>):<p>No outstanding schedules.</p>}<p className="curriculum-note">Use Room and Schedule Assignment → Admin approvals to validate and decide pending proposals.</p></div>
   </div>
  </>:tab==='conflicts'?<>
   <h3>Detected schedule conflicts</h3>{unresolved.length?unresolved.map((issue,i)=><div className="admin-conflict" key={i}><strong>{issue.kind}</strong><p>{issue.details}</p></div>):<p>No overlapping approved meetings found.</p>}
   <h3>Reschedule an approved assignment</h3>
   <p className="curriculum-note">Choose an approved meeting below. All changes are checked for instructor, room, student-block and availability conflicts and recorded in the administrative audit log.</p>
   <div className="selection-rows">{published.length?published.map(p=><div className="selection-row" key={p.id}><div><strong>{courseText(p.course_offering_id)}</strong><p>{profName(p.faculty_id)} · {patternLabel(p)} · {p.meeting_pattern==='FIELD'?'No room required':clock(p.start_minute)+'–'+clock(p.start_minute+p.duration_minutes)+' · '+vMap.get(p.venue_id)?.name}</p></div><button className="ghost" type="button" onClick={()=>openRevision(p)}>Reschedule</button></div>):<p>No approved schedules yet.</p>}</div>
   {editing&&<div className="admin-revision-form"><h3>Revise: {courseText(editing.course_offering_id)}</h3>
    <div className="schedule-form-grid">
     <label>Room / venue<select value={venueId} onChange={e=>setVenueId(e.target.value)}>{venues.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
     <label>Meeting pattern<select disabled={kind!=='MW'} value={effectivePattern} onChange={e=>setPattern(e.target.value)}>
      {kind==='PATHFIT'?<option value="PATHFIT">PATHFit · 2 hours</option>:kind==='NSTP'?<option value="NSTP">NSTP · Friday</option>:<><option value="MW">Monday & Wednesday</option><option value="TTH">Tuesday & Thursday</option></>}</select></label>
     {effectivePattern==='PATHFIT'&&<label>PATHFit weekday<select value={weekday} onChange={e=>setWeekday(Number(e.target.value))}>{WEEKDAYS.map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></label>}
     <label>Start time<select value={validStarts.includes(start)?start:(validStarts[0]??450)} onChange={e=>setStart(Number(e.target.value))}>{validStarts.map(t=><option key={t} value={t}>{clock(t)}–{clock(t+duration)}</option>)}</select></label>
    </div>
    <label>Required justification<textarea rows={3} minLength={10} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason for adjusting the approved room or meeting time"/></label>
    <div className="availability-dialog-actions"><button className="primary" disabled={busy||reason.trim().length<10||!venueId} onClick={()=>void move()}>Save verified change</button><button className="ghost" onClick={()=>setEditId(null)}>Cancel</button></div>
   </div>}
  </>:<>
    <h3>Official timetable publication</h3>
    <p className="curriculum-note">Only approved meetings are publishable. The database checks for overlapping instructors, rooms and student blocks before creating an official publication record. Rescheduling an approved meeting automatically makes the timetable a draft again.</p>
    <div className="publication-readiness">
     <p><strong>Approved schedules:</strong> {published.length}</p>
     <p><strong>Published sessions:</strong> {activeMeetings.length}</p>
     <p><strong>Detected conflicts:</strong> {unresolved.length}</p>
     <p><strong>Current publication:</strong> {publication?new Date(publication.published_at).toLocaleString():'Not yet published'}</p>
    </div>
    {pendingAssignments.length>0||pendingSchedules.length>0?<p className="curriculum-note">Note: Some course or schedule requests remain pending. You may publish the approved subset, but that is not a complete campus timetable.</p>:null}
    <label>Publication memorandum / justification<textarea rows={3} minLength={10} maxLength={1000} value={publishNote} onChange={e=>setPublishNote(e.target.value)} placeholder="Reviewed and authorized approved semester schedule for campus publication"/></label>
    <div className="availability-dialog-actions"><button className="primary" disabled={busy||activeMeetings.length===0||unresolved.length>0||publishNote.trim().length<10} onClick={()=>void publish()}>{publication?'Republish approved timetable':'Publish approved timetable'}</button></div>
    <h3>Recent administrative history</h3><div className="selection-rows">{audit.length?audit.map(a=><div className="admin-review-item" key={a.id}><strong>{a.action==='publish'?'Publication':a.action==='reschedule'?'Approved schedule revision':a.action}</strong><p>{a.justification}</p><small>{new Date(a.recorded_at).toLocaleString()}</small></div>):<p>No recorded changes yet.</p>}</div>
  </>}
  {message&&<div className="notice" role="status">{message}</div>}
 </section>;
}
