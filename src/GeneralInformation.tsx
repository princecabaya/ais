import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

type Assignment={
 offering_id:number;course_code:string;course_title:string;block:string;program:string;
 faculty_name:string;status:string;pending_count:number
};
type Booking={
 meeting_id:number;weekday:number;start_minute:number;end_minute:number;
 venue_id:number;venue_name:string;course_code:string;block:string;
 faculty_name:string;publication_status:'published'|'approved_draft'
};
type Snapshot={term_id:number|null;assignments:Assignment[];bookings:Booking[]};
type Offering={id:number;academic_term_id:number;status:string;class_section_id:string;curriculum_course_id:number};
type Course={id:number;course_code:string;course_title:string};
type Section={id:string;block_label:string;program:string};
type Venue={id:number;name:string;active:boolean};
type Term={id:number;academic_year:string;semester:number;is_active:boolean};
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const clock=(n:number)=>{
 const h=Math.floor(n/60),min=String(n%60).padStart(2,'0');
 return `${((h+11)%12)+1}:${min} ${h<12?'AM':'PM'}`;
};
const PERIODS=[[450,540],[540,630],[630,720],[780,870],[870,960],[960,1050],[1050,1140]] as const;
export function GeneralInformation(){
 const [snapshot,setSnapshot]=useState<Snapshot>({term_id:null,assignments:[],bookings:[]});
 const [offerings,setOfferings]=useState<Offering[]>([]);
 const [courses,setCourses]=useState<Course[]>([]);
 const [sections,setSections]=useState<Section[]>([]);
 const [venues,setVenues]=useState<Venue[]>([]);
 const [terms,setTerms]=useState<Term[]>([]);
 const [pane,setPane]=useState<'courses'|'rooms'>('courses');
 const [search,setSearch]=useState('');
 const [program,setProgram]=useState('ALL');
 const [day,setDay]=useState(1);
 const [room,setRoom]=useState('ALL');
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');
 const load=useCallback(async()=>{
  if(!supabase)return;
  setLoading(true);setMessage('');
  const [snap,o,c,s,v,t]=await Promise.all([
   supabase.rpc('general_information_snapshot'),
   supabase.from('course_offerings').select('id,academic_term_id,status,class_section_id,curriculum_course_id'),
   supabase.from('curriculum_courses').select('id,course_code,course_title'),
   supabase.from('class_sections').select('id,block_label,program'),
   supabase.from('schedule_venues').select('id,name,active').eq('active',true).order('name'),
   supabase.from('academic_terms').select('id,academic_year,semester,is_active')
  ]);
  const error=[snap,o,c,s,v,t].find(x=>x.error)?.error;
  if(error)setMessage(error.message);
  else{
   const raw=snap.data as Partial<Snapshot>|null;
   setSnapshot({
    term_id:raw?.term_id??null,
    assignments:Array.isArray(raw?.assignments)?raw.assignments:[],
    bookings:Array.isArray(raw?.bookings)?raw.bookings:[]
   });
   setOfferings((o.data||[]) as Offering[]);
   setCourses((c.data||[]) as Course[]);
   setSections((s.data||[]) as Section[]);
   setVenues((v.data||[]) as Venue[]);
   setTerms((t.data||[]) as Term[]);
  }
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 const term=terms.find(t=>t.is_active);
 const rows=useMemo(()=>{
  const courseMap=new Map(courses.map(c=>[c.id,c]));
  const sectionMap=new Map(sections.map(s=>[s.id,s]));
  const assigned=new Map(snapshot.assignments.map(a=>[a.offering_id,a]));
  return offerings.filter(o=>o.academic_term_id===snapshot.term_id&&o.status==='available')
   .map(o=>{
    const c=courseMap.get(o.curriculum_course_id),s=sectionMap.get(o.class_section_id),a=assigned.get(o.id);
    return {id:o.id,code:c?.course_code||'—',title:c?.course_title||'Course',block:s?.block_label||'Block',
      program:s?.program||'—',faculty:a?.faculty_name||null,assigned:!!a};
   })
   .filter(r=>(program==='ALL'||r.program===program)&&
    (!search||[r.code,r.title,r.block,r.faculty||''].some(x=>x.toLowerCase().includes(search.toLowerCase()))))
   .sort((a,b)=>a.program.localeCompare(b.program)||a.block.localeCompare(b.block,undefined,{numeric:true})||a.code.localeCompare(b.code));
 },[courses,sections,offerings,snapshot,program,search]);
 const booked=snapshot.bookings.filter(b=>b.weekday===day&&(room==='ALL'||b.venue_id===Number(room)));
 const busyRoomCount=new Set(snapshot.bookings.filter(b=>b.weekday===day).map(b=>b.venue_id)).size;
 return <section className="panel general-info" id="general-information">
  <div className="selection-top">
   <div><span className="kicker">FACULTY REFERENCE · CURRENT SEMESTER</span><h2>General Information</h2>
    <p>See which subjects are assigned to faculty and when classrooms are already occupied.</p></div>
   <button type="button" className="ghost" disabled={loading} onClick={()=>void load()}>Refresh information</button>
  </div>
  <p className="curriculum-note">Showing {term?`${term.academic_year} · ${term.semester===1?'First':'Second'} Semester`:'the current active term'}. These are shared campus records, not personal course requests.</p>
  <div className="general-info-metrics">
   <div><strong>{snapshot.assignments.length}</strong><span>Approved course assignments</span></div>
   <div><strong>{snapshot.bookings.length}</strong><span>Approved weekly room meetings</span></div>
   <div><strong>{venues.length}</strong><span>Registered active venues</span></div>
  </div>
  <div className="curriculum-tabs">
   <button type="button" className={pane==='courses'?'curriculum-tab selected':'curriculum-tab'} onClick={()=>setPane('courses')}>Who teaches each subject?</button>
   <button type="button" className={pane==='rooms'?'curriculum-tab selected':'curriculum-tab'} onClick={()=>setPane('rooms')}>Room bookings by time</button>
  </div>
  {loading?<p>Loading course and room information…</p>:message?<div className="notice" role="alert">{message}</div>:pane==='courses'?<>
   <div className="general-info-filters">
    <label>Program<select value={program} onChange={e=>setProgram(e.target.value)}><option value="ALL">All programs</option><option value="BEEd">BEEd</option><option value="BSE">BSE</option></select></label>
    <label>Find subject, block or instructor<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search course code, subject or faculty"/></label>
   </div>
   <p className="curriculum-note">{rows.length} matching offerings. <strong>Assigned</strong> means a course has been approved for that particular student block. An unassigned course may still have pending requests.</p>
   <div className="general-info-course-list">
    {rows.map(r=><article className="general-info-course-row" key={r.id}>
     <div><strong>{r.code} · {r.block}</strong><small>{r.title} · {r.program}</small></div>
     <div className="general-info-course-status">{r.assigned?
      <><span className="general-status assigned">Assigned</span><strong>{r.faculty}</strong></>:
      <><span className="general-status unassigned">Not yet assigned</span><small>Administrator approval pending or not requested</small></>}</div>
    </article>)}
    {rows.length===0&&<p className="selection-empty">No courses match these filters.</p>}
   </div>
  </>:<>
   <div className="general-info-filters">
    <label>Day<select value={day} onChange={e=>setDay(Number(e.target.value))}>{DAYS.map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></label>
    <label>Room or venue<select value={room} onChange={e=>setRoom(e.target.value)}><option value="ALL">All rooms and venues</option>{venues.map(v=><option value={v.id} key={v.id}>{v.name}</option>)}</select></label>
   </div>
   <p className="curriculum-note">{booked.length} approved meetings displayed · {busyRoomCount} room{busyRoomCount===1?'':'s'} booked on {DAYS[day-1]}. Confirmed meeting times cannot be double-booked.</p>
   <div className="general-room-scroll"><table className="general-room-table"><thead><tr><th>Period</th>{(room==='ALL'?venues:venues.filter(v=>v.id===Number(room))).map(v=><th key={v.id}>{v.name}</th>)}</tr></thead><tbody>{PERIODS.map(([start,end])=><tr key={start}><th>{clock(start)}–{clock(end)}</th>{(room==='ALL'?venues:venues.filter(v=>v.id===Number(room))).map(v=>{
    const hits=booked.filter(b=>b.venue_id===v.id&&b.start_minute<end&&b.end_minute>start);
    return <td key={v.id}>{hits.length?hits.map(h=><div className="general-room-booked" key={h.meeting_id}>
     <strong>{h.course_code} · {h.block}</strong><small>{clock(h.start_minute)}–{clock(h.end_minute)}</small>
     <small>{h.faculty_name}</small><em>{h.publication_status==='published'?'Published timetable':'Approved · not published'}</em>
    </div>):<span className="general-room-free">No approved booking</span>}</td>;
   })}</tr>)}</tbody></table></div>
   <p className="curriculum-note">A blank room slot means no approved booking is recorded. It does not guarantee availability: pending preferences, maintenance, or other campus activities may not be represented. Room bookings are recorded only when an administrator approves the meeting.</p>
  </>}
 </section>;
}
