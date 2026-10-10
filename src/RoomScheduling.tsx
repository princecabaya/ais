import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from './supabase';

type Venue={id:number;name:string;venue_type:string;active:boolean};
type Request={id:number;faculty_id:string;course_offering_id:number;academic_term_id:number;status:string};
type Offering={id:number;class_section_id:string;curriculum_course_id:number};
type Course={id:number;course_code:string;course_title:string;units:number|null};
type Section={id:string;block_label:string};
type Faculty={id:string;first_name:string;last_name:string;department:string};
type Proposal={id:number;course_request_id:number;academic_term_id:number;faculty_id:string;course_offering_id:number;venue_id:number;meeting_pattern:string;pathfit_weekday:number|null;start_minute:number;duration_minutes:number;status:string;submitted_at:string;decision_note:string|null};
type Meeting={id:number;proposal_id:number;academic_term_id:number;faculty_id:string;class_section_id:string;venue_id:number;weekday:number;start_minute:number;end_minute:number};
type Term={id:number;academic_year:string;semester:number;is_active:boolean};
type Publication={academic_term_id:number;published_at:string;revision:number};
const DAYS=['Mon','Tue','Wed','Thu','Fri'];
const TIMES=[450,540,630,780,870,960,1050];
const clock=(minutes:number)=>{const h=Math.floor(minutes/60),m=minutes%60;return ((h+11)%12+1)+':'+String(m).padStart(2,'0')+(h>=12?' PM':' AM')};
const days=(p:Proposal)=>p.meeting_pattern==='FIELD'?'Field placement':p.meeting_pattern==='MW'?'Monday & Wednesday':p.meeting_pattern==='TTH'?'Tuesday & Thursday':p.meeting_pattern==='NSTP'?'Friday':DAYS[(p.pathfit_weekday??1)-1];
const formPattern=(code:string,units:number|null,title:string)=>{if(/field study|internship|practicum/i.test(title))return 'FIELD';const compact=code.toUpperCase().replace(/\s+/g,'');return compact.startsWith('NSTP')?'NSTP':compact.startsWith('PATHFIT')?'PATHFIT':units===3?'MW':'UNSUPPORTED'};
type Pattern='MW'|'TTH'|'PATHFIT'|'NSTP'|'FIELD';
export function RoomScheduling({facultyId,isAdmin}:{facultyId:string;isAdmin:boolean}){
 const [venues,setVenues]=useState<Venue[]>([]);
 const [requests,setRequests]=useState<Request[]>([]);
 const [offerings,setOfferings]=useState<Offering[]>([]);
 const [courses,setCourses]=useState<Course[]>([]);
 const [sections,setSections]=useState<Section[]>([]);
 const [proposals,setProposals]=useState<Proposal[]>([]);
 const [meetings,setMeetings]=useState<Meeting[]>([]);
 const [terms,setTerms]=useState<Term[]>([]);
 const [faculty,setFaculty]=useState<Faculty[]>([]);
 const [publications,setPublications]=useState<Publication[]>([]);
 const [selectedRequest,setSelectedRequest]=useState('');
 const [venue,setVenue]=useState('');
 const [pattern,setPattern]=useState<Pattern>('MW');
 const [pathDay,setPathDay]=useState(1);
 const [start,setStart]=useState(450);
 const [roomName,setRoomName]=useState('');
 const [roomType,setRoomType]=useState('room');
 const [reason,setReason]=useState<Record<number,string>>({});
 const [selectedDay,setSelectedDay]=useState(1);
 const [selectedVenue,setSelectedVenue]=useState('ALL');
 const [tab,setTab]=useState<'propose'|'timetable'|'review'>('propose');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const currentTerm=terms.find(t=>t.is_active);
 const isPublished=publications.some(p=>p.academic_term_id===currentTerm?.id);
 const load=useCallback(async()=>{
  if(!supabase)return;setLoading(true);
  const [v,r,o,c,s,p,m,t,f,pub]=await Promise.all([
   supabase.from('schedule_venues').select('id,name,venue_type,active').eq('active',true).order('name'),
   supabase.from('faculty_course_requests').select('id,faculty_id,course_offering_id,academic_term_id,status').eq('status','approved'),
   supabase.from('course_offerings').select('id,class_section_id,curriculum_course_id'),
   supabase.from('curriculum_courses').select('id,course_code,course_title,units'),
   supabase.from('class_sections').select('id,block_label'),
   supabase.from('schedule_proposals').select('id,course_request_id,academic_term_id,faculty_id,course_offering_id,venue_id,meeting_pattern,pathfit_weekday,start_minute,duration_minutes,status,submitted_at,decision_note').order('submitted_at',{ascending:false}),
   supabase.from('schedule_meetings').select('id,proposal_id,academic_term_id,faculty_id,class_section_id,venue_id,weekday,start_minute,end_minute').eq('active',true),
   supabase.from('academic_terms').select('id,academic_year,semester,is_active'),
   isAdmin?supabase.from('profiles').select('id,first_name,last_name,department').eq('status','active'):Promise.resolve({data:[] as Faculty[],error:null}),
   supabase.from('schedule_publications').select('academic_term_id,published_at,revision')
  ]);
  const error=[v,r,o,c,s,p,m,t,f,pub].find(x=>x.error)?.error;
  if(error)setMessage(error.message);
  else{
   setVenues((v.data||[]) as Venue[]);setRequests((r.data||[]) as Request[]);
   setOfferings((o.data||[]) as Offering[]);setCourses((c.data||[]) as Course[]);
   setSections((s.data||[]) as Section[]);setProposals((p.data||[]) as Proposal[]);
   setMeetings((m.data||[]) as Meeting[]);setTerms((t.data||[]) as Term[]);
   setFaculty((f.data||[]) as Faculty[]);
   setPublications((pub.data||[]) as Publication[]);
  }
  setLoading(false);
 },[isAdmin]);
 useEffect(()=>{void load()},[load]);
 const offeringMap=useMemo(()=>new Map(offerings.map(o=>[o.id,o])),[offerings]);
 const courseMap=useMemo(()=>new Map(courses.map(c=>[c.id,c])),[courses]);
 const sectionMap=useMemo(()=>new Map(sections.map(s=>[s.id,s])),[sections]);
 const venueMap=useMemo(()=>new Map(venues.map(v=>[v.id,v])),[venues]);
 const facultyMap=useMemo(()=>new Map(faculty.map(f=>[f.id,f])),[faculty]);
 const label=(offeringId:number)=>{
  const o=offeringMap.get(offeringId);if(!o)return 'Unknown offering';
  const c=courseMap.get(o.curriculum_course_id),s=sectionMap.get(o.class_section_id);
  return (c?.course_code||'Course')+' · '+(s?.block_label||'Block')+' — '+(c?.course_title||'Untitled');
 };
 const assigned=requests.filter(r=>r.faculty_id===facultyId&&r.academic_term_id===currentTerm?.id);
 const selected=assigned.find(r=>String(r.id)===selectedRequest);
 const selectedCourse=selected?courseMap.get(offeringMap.get(selected.course_offering_id)?.curriculum_course_id??-1):undefined;
 const kind=selectedCourse?formPattern(selectedCourse.course_code,selectedCourse.units,selectedCourse.course_title):'MW';
 const effectivePattern=kind==='FIELD'?'FIELD':kind==='NSTP'?'NSTP':kind==='PATHFIT'?'PATHFIT':pattern;
 const duration=effectivePattern==='FIELD'?0:effectivePattern==='NSTP'?180:effectivePattern==='PATHFIT'?120:90;
 const permittedTimes=TIMES.filter(n=>n+duration<=1140&&!(n<720&&n+duration>780));
 const myProposals=proposals.filter(p=>p.faculty_id===facultyId&&p.academic_term_id===currentTerm?.id);
 const pending=proposals.filter(p=>p.status==='pending'&&p.academic_term_id===currentTerm?.id);
 const activeMeetings=meetings.filter(m=>m.academic_term_id===currentTerm?.id&&m.weekday===selectedDay&&(selectedVenue==='ALL'||m.venue_id===Number(selectedVenue))).sort((a,b)=>a.start_minute-b.start_minute);
 const conflict=(m:Meeting)=>{
  const p=proposals.find(x=>x.id===m.proposal_id);
  return p?.meeting_pattern||'';
 };
 async function submit(e:FormEvent){
  e.preventDefault();if(!supabase||!selected)return;setBusy(true);setMessage('');
  const {error}=await supabase.rpc('submit_schedule_proposal',{p_course_request_id:selected.id,p_venue_id:kind==='FIELD'?null:Number(venue),p_pattern:effectivePattern,p_start_minute:kind==='FIELD'?450:(permittedTimes.includes(start)?start:(permittedTimes[0]??450)),p_pathfit_day:effectivePattern==='PATHFIT'?pathDay:null});
  if(error)setMessage(error.message);
  else{setMessage('Schedule proposal submitted. Administrator approval is required.');await load();}
  setBusy(false);
 }
 async function addRoom(e:FormEvent){
  e.preventDefault();if(!supabase)return;setBusy(true);setMessage('');
  const {error}=await supabase.rpc('admin_add_venue',{p_name:roomName.trim(),p_type:roomType});
  if(error)setMessage(error.message);
  else{setRoomName('');setMessage('New room or venue added.');await load();}
  setBusy(false);
 }
 async function withdraw(id:number){
  if(!supabase||!window.confirm('Withdraw this pending schedule proposal?'))return;
  setBusy(true);const {error}=await supabase.rpc('withdraw_schedule_proposal',{p_id:id});
  if(error)setMessage(error.message);else{setMessage('Proposal withdrawn.');await load();}
  setBusy(false);
 }
 async function decide(id:number,approved:boolean){
  if(!supabase)return;setBusy(true);setMessage('');
  const {error}=await supabase.rpc('decide_schedule_proposal',{p_id:id,p_approve:approved,p_reason:reason[id]?.trim()||''});
  if(error)setMessage(error.message);
  else{setMessage('Decision recorded. Approved sessions were published and the instructor notified.');await load();}
  setBusy(false);
 }
 return <section className="panel room-scheduler" id="room-scheduling">
  <div className="selection-top"><div><span className="kicker">PHASE 2 · ROOM AND MEETING ASSIGNMENTS</span><h2>Room and Schedule Assignment</h2><p>Submit room and meeting proposals for approved courses. Approved schedules appear in the shared timetable.</p></div><button type="button" className="ghost" onClick={()=>void load()}>Refresh</button></div>
  <div className="selection-metrics">
   <div><strong>{venues.length}</strong><span>Available rooms / venues</span></div>
   <div><strong>{myProposals.filter(p=>p.status==='pending').length}</strong><span>My pending proposals</span></div>
   <div><strong>{meetings.filter(m=>m.academic_term_id===currentTerm?.id).length}</strong><span>Published meeting sessions</span></div>
   {isAdmin&&<div><strong>{pending.length}</strong><span>Awaiting schedule review</span></div>}
  </div>
  <p className="curriculum-note">{currentTerm?currentTerm.academic_year+' · Semester '+currentTerm.semester:'No active term'} · Only approved course requests can be scheduled. Special 5- and 6-unit internship/implementation courses require separate workload rules.</p>
  <div className="curriculum-tabs">
   <button className={tab==='propose'?'curriculum-tab selected':'curriculum-tab'} type="button" onClick={()=>setTab('propose')}>My schedule proposals</button>
   <button className={tab==='timetable'?'curriculum-tab selected':'curriculum-tab'} type="button" onClick={()=>setTab('timetable')}>Published timetable</button>
   {isAdmin&&<button className={tab==='review'?'curriculum-tab selected':'curriculum-tab'} type="button" onClick={()=>setTab('review')}>Admin approvals ({pending.length})</button>}
  </div>
  {loading?<p>Loading schedule information…</p>:tab==='propose'?<>
   <form className="schedule-proposal-form" onSubmit={submit}>
    <label>Approved course assignment<select required value={selectedRequest} onChange={e=>{const value=e.target.value;setSelectedRequest(value);setPattern('MW');setStart(450)}}>
     <option value="">Choose an approved course…</option>{assigned.map(r=><option key={r.id} value={r.id}>{label(r.course_offering_id)}</option>)}
    </select></label>
    {selected&&<div className="schedule-advice">{kind==='NSTP'?'NSTP: one continuous 3-hour meeting on Friday.':kind==='PATHFIT'?'PATHFit: one continuous 2-hour meeting, Monday through Friday.':kind==='FIELD'?'Field placement: no classroom or fixed timetable period required.':kind==='UNSUPPORTED'?'This course needs an administrator-defined meeting rule before it can be scheduled.':'Three-unit course: two linked 90-minute meetings at the same time on MW or Tuesday/Thursday.'}</div>}
    <div className="schedule-form-grid">
     <label>Meeting pattern<select disabled={kind==='NSTP'||kind==='PATHFIT'||kind==='UNSUPPORTED'||kind==='FIELD'} value={effectivePattern} onChange={e=>setPattern(e.target.value as Pattern)}>
      {kind==='FIELD'?<option value="FIELD">No fixed classroom schedule</option>:kind==='NSTP'?<option value="NSTP">Friday · NSTP</option>:kind==='PATHFIT'?<option value="PATHFIT">Single day · PATHFit</option>:kind==='UNSUPPORTED'?<option value="MW">Rules pending</option>:<><option value="MW">Monday & Wednesday</option><option value="TTH">Tuesday & Thursday</option></>}
     </select></label>
     {effectivePattern==='PATHFIT'&&<label>PATHFit weekday<select value={pathDay} onChange={e=>setPathDay(Number(e.target.value))}>{DAYS.map((d,i)=><option key={d} value={i+1}>{['Monday','Tuesday','Wednesday','Thursday','Friday'][i]}</option>)}</select></label>}
     {kind!=='FIELD'&&<label>Start time<select value={permittedTimes.includes(start)?start:(permittedTimes[0]??450)} onChange={e=>setStart(Number(e.target.value))}>{permittedTimes.map(n=><option key={n} value={n}>{clock(n)} – {clock(n+duration)}</option>)}</select></label>}
     {kind!=='FIELD'&&<label>Room / venue<select required value={venue} onChange={e=>setVenue(e.target.value)}><option value="">Choose location…</option>{venues.map(v=><option key={v.id} value={v.id}>{v.name} · {v.venue_type}</option>)}</select></label>}
    </div>
    <button className="primary" disabled={busy||!selected||(kind!=='FIELD'&&!venue)||kind==='UNSUPPORTED'} type="submit">Submit schedule for approval</button>
   </form>
   <h3>My schedule requests</h3><div className="selection-rows">
    {myProposals.length?myProposals.map(p=><div className="selection-row" key={p.id}><div><strong>{label(p.course_offering_id)}</strong><p>{p.meeting_pattern==='FIELD'?'Field placement (no fixed session)':days(p)+' · '+clock(p.start_minute)+'–'+clock(p.start_minute+p.duration_minutes)} · {p.meeting_pattern==='FIELD'?'No room required':venueMap.get(p.venue_id)?.name||'Venue'} · <strong>{p.status}</strong></p>{p.decision_note&&<small>Administrator: {p.decision_note}</small>}</div>{p.status==='pending'&&<button className="ghost" disabled={busy} type="button" onClick={()=>void withdraw(p.id)}>Withdraw</button>}</div>):<p>No schedule proposals yet. First obtain approval for a course preference in Course Selection.</p>}
   </div>
  </>:tab==='timetable'?<>
    {!isPublished&&<p className="curriculum-note">{isAdmin?'Administrator preview: this timetable has not been published.':'The official timetable is not yet published. Approved course allocations remain visible in your course requests.'}</p>}
    <div className="schedule-filter-row"><label>Weekday<select value={selectedDay} onChange={e=>setSelectedDay(Number(e.target.value))}>{DAYS.map((d,i)=><option key={d} value={i+1}>{['Monday','Tuesday','Wednesday','Thursday','Friday'][i]}</option>)}</select></label><label>Venue<select value={selectedVenue} onChange={e=>setSelectedVenue(e.target.value)}><option value="ALL">All rooms and venues</option>{venues.map(v=><option value={v.id} key={v.id}>{v.name}</option>)}</select></label></div>
    <div className="schedule-session-list">{activeMeetings.length?activeMeetings.map(m=><div className="published-session" key={m.id}><strong>{clock(m.start_minute)}–{clock(m.end_minute)}</strong><span>{label(proposals.find(p=>p.id===m.proposal_id)?.course_offering_id??-1)}</span><span>{venueMap.get(m.venue_id)?.name} · {facultyMap.get(m.faculty_id)?facultyMap.get(m.faculty_id)!.first_name+' '+facultyMap.get(m.faculty_id)!.last_name:'Faculty assignment'} · {conflict(m)}</span></div>):<p>No approved sessions for these filters.</p>}</div>
  </>:<div className="selection-rows">{pending.length?pending.map(p=><div className="selection-row admin-decision" key={p.id}><div><strong>{label(p.course_offering_id)}</strong><p>{days(p)} · {clock(p.start_minute)}–{clock(p.start_minute+p.duration_minutes)} · {venueMap.get(p.venue_id)?.name}</p><small>Instructor: {facultyMap.get(p.faculty_id)?.last_name||p.faculty_id.slice(0,8)}. Conflicts and unavailable periods are checked when you approve.</small></div><div className="decision-controls"><label>Approval / rejection justification<input minLength={10} value={reason[p.id]||''} onChange={e=>setReason(prev=>({...prev,[p.id]:e.target.value}))} placeholder="Confirm room, section, and instructor capacity"/></label><div><button className="primary" disabled={busy||!reason[p.id]||reason[p.id].trim().length<10} type="button" onClick={()=>void decide(p.id,true)}>Approve schedule</button><button className="ghost" disabled={busy||!reason[p.id]||reason[p.id].trim().length<10} type="button" onClick={()=>void decide(p.id,false)}>Reject</button></div></div></div>):<p>No pending schedule proposals.</p>}</div>}
  {isAdmin&&<div className="schedule-venue-management"><h3>Admin · Add a room or venue</h3><form className="schedule-venue-form" onSubmit={addRoom}><label>Name<input required minLength={2} maxLength={100} placeholder="Room 8 / Covered Court" value={roomName} onChange={e=>setRoomName(e.target.value)}/></label><label>Venue type<select value={roomType} onChange={e=>setRoomType(e.target.value)}>{['room','gym','field','hall','offsite','other'].map(t=><option key={t} value={t}>{t}</option>)}</select></label><button className="primary" disabled={busy}>Add venue</button></form></div>}
  {message&&<div className="notice" role="status">{message}</div>}
 </section>;
}
