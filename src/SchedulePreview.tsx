import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

type Faculty={id:string;first_name:string;last_name:string;department:string};
type Term={id:number;academic_year:string;semester:number;is_active:boolean};
type Request={id:number;faculty_id:string;course_offering_id:number;academic_term_id:number;status:string;preferred_pattern:string|null;preferred_start_minute:number|null;preferred_pathfit_weekday:number|null;preferred_venue_id:number|null};
type Offering={id:number;class_section_id:string;curriculum_course_id:number};
type Course={id:number;course_code:string;course_title:string};
type Block={id:string;block_label:string};
type Venue={id:number;name:string};
type Meeting={id:number;faculty_id:string;academic_term_id:number;course_offering_id:number;weekday:number;start_minute:number;end_minute:number;venue_id:number};
type Session={sourceId:number;offeringId:number;weekday:number;start:number;end:number;facultyId:string;venueId:number|null;status:'pending'|'approved'|'scheduled';label:string};
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const GRID=[450,540,630,780,870,960,1050,1140];
const time=(n:number)=>{const h=Math.floor(n/60);return ((h+11)%12+1)+':'+String(n%60).padStart(2,'0')+(h>=12?' PM':' AM')};
const overlap=(a:Session,b:Session)=>a.weekday===b.weekday&&a.start<b.end&&b.start<a.end;
export function SchedulePreview({facultyId,isAdmin}:{facultyId:string;isAdmin:boolean}){
 const [open,setOpen]=useState(isAdmin);
 const [viewId,setViewId]=useState(facultyId);
 const [terms,setTerms]=useState<Term[]>([]);
 const [faculty,setFaculty]=useState<Faculty[]>([]);
 const [requests,setRequests]=useState<Request[]>([]);
 const [offerings,setOfferings]=useState<Offering[]>([]);
 const [courses,setCourses]=useState<Course[]>([]);
 const [blocks,setBlocks]=useState<Block[]>([]);
 const [venues,setVenues]=useState<Venue[]>([]);
 const [meetings,setMeetings]=useState<Meeting[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const load=useCallback(async()=>{
  if(!supabase)return;setLoading(true);
  const [t,f,r,o,c,b,v,m]=await Promise.all([
   supabase.from('academic_terms').select('id,academic_year,semester,is_active'),
   isAdmin?supabase.from('profiles').select('id,first_name,last_name,department').eq('status','active').order('last_name'):Promise.resolve({data:[] as Faculty[],error:null}),
   supabase.from('faculty_course_requests').select('id,faculty_id,course_offering_id,academic_term_id,status,preferred_pattern,preferred_start_minute,preferred_pathfit_weekday,preferred_venue_id').in('status',['pending','approved']),
   supabase.from('course_offerings').select('id,class_section_id,curriculum_course_id'),
   supabase.from('curriculum_courses').select('id,course_code,course_title'),
   supabase.from('class_sections').select('id,block_label'),
   supabase.from('schedule_venues').select('id,name'),
   supabase.from('schedule_meetings').select('id,faculty_id,academic_term_id,course_offering_id,weekday,start_minute,end_minute,venue_id').eq('active',true)
  ]);
  const problem=[t,f,r,o,c,b,v,m].find(x=>x.error)?.error;
  if(problem)setError(problem.message);
  else{
   setTerms(t.data as Term[]||[]);setFaculty(f.data as Faculty[]||[]);
   setRequests(r.data as Request[]||[]);setOfferings(o.data as Offering[]||[]);
   setCourses(c.data as Course[]||[]);setBlocks(b.data as Block[]||[]);
   setVenues(v.data as Venue[]||[]);setMeetings(m.data as Meeting[]||[]);
   setError('');
  }setLoading(false);
 },[isAdmin]);
 useEffect(()=>{if(open)void load()},[open,load]);
 const term=terms.find(t=>t.is_active);
 const sessions=useMemo(()=>{
  const cmap=new Map(courses.map(c=>[c.id,c])),omap=new Map(offerings.map(o=>[o.id,o])),bmap=new Map(blocks.map(b=>[b.id,b]));
  const title=(id:number)=>{const o=omap.get(id);return (cmap.get(o?.curriculum_course_id??-1)?.course_code||'Course')+' · '+(bmap.get(o?.class_section_id||'')?.block_label||'Block')};
  const list:Session[]=[];
  const approvedMeetings=meetings.filter(m=>m.faculty_id===viewId&&m.academic_term_id===term?.id);
  const scheduledOfferingIds=new Set(approvedMeetings.map(m=>m.course_offering_id));
  for(const m of approvedMeetings)list.push({sourceId:m.id,offeringId:m.course_offering_id,weekday:m.weekday,start:m.start_minute,end:m.end_minute,facultyId:viewId,venueId:m.venue_id,status:'scheduled',label:title(m.course_offering_id)});
  for(const r of requests){
   if(r.faculty_id!==viewId||r.academic_term_id!==term?.id||!r.preferred_pattern||r.preferred_start_minute===null||scheduledOfferingIds.has(r.course_offering_id))continue;
   const duration=r.preferred_pattern==='NSTP'?180:r.preferred_pattern==='PATHFIT'?120:90;
   const days=r.preferred_pattern==='MW'?[1,3]:r.preferred_pattern==='TTH'?[2,4]:r.preferred_pattern==='NSTP'?[5]:[r.preferred_pathfit_weekday??1];
   for(const day of days)list.push({sourceId:r.id,offeringId:r.course_offering_id,weekday:day,start:r.preferred_start_minute,end:r.preferred_start_minute+duration,facultyId:r.faculty_id,venueId:r.preferred_venue_id,status:r.status==='approved'?'approved':'pending',label:title(r.course_offering_id)});
  }
  return list.sort((a,b)=>a.weekday-b.weekday||a.start-b.start);
 },[courses,offerings,blocks,meetings,requests,viewId,term?.id]);
 const pairs=useMemo(()=>{
  const found:{a:Session;b:Session}[]=[];
  for(let i=0;i<sessions.length;i++)for(let j=i+1;j<sessions.length;j++){
   const a=sessions[i],b=sessions[j];
   if(a.offeringId!==b.offeringId&&overlap(a,b))found.push({a,b});
  }return found;
 },[sessions]);
 const venueMap=new Map(venues.map(v=>[v.id,v.name]));
 return <section className="panel schedule-preview" id="faculty-schedule-preview">
  <button className="schedule-preview-toggle" type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
   <span><strong>Weekly Schedule Preview</strong><small>Selected courses · pending and approved meetings · overlap check</small></span>
   <span>{open?'Hide ▲':'Show ▼'}</span>
  </button>
  {open&&<>
   <div className="schedule-preview-toolbar">
    {isAdmin&&<label>Review faculty<select value={viewId} onChange={e=>setViewId(e.target.value)}>{faculty.map(f=><option key={f.id} value={f.id}>{f.last_name}, {f.first_name} · {f.department}</option>)}</select></label>}
    <button className="ghost" type="button" onClick={()=>void load()}>Refresh preview</button>
   </div>
   <p className="curriculum-note">{term?term.academic_year+' · Semester '+term.semester:'No active term'} · Includes saved course preferences before approval and actual approved meetings. Requests without a selected time are not shown.</p>
   {loading?<p>Loading timetable…</p>:error?<div className="notice" role="alert">{error}</div>:<>
    {pairs.length?<div className="preview-conflicts" role="alert"><strong>{pairs.length} overlapping class pair{pairs.length===1?'':'s'} detected</strong>{pairs.map((pair,i)=><p key={i}>{DAYS[pair.a.weekday-1]} {time(Math.max(pair.a.start,pair.b.start))}–{time(Math.min(pair.a.end,pair.b.end))}: {pair.a.label} conflicts with {pair.b.label}</p>)}<small>Resolve conflicting requests before administrator approval. One instructor must teach only one class at any given time.</small></div>:<p className="preview-safe"><strong>No overlaps detected</strong> among the selected and approved meetings shown.</p>}
    <div className="preview-table-scroll"><table className="preview-table"><thead><tr><th>Time</th>{DAYS.map(d=><th key={d}>{d}</th>)}</tr></thead><tbody>{GRID.slice(0,-1).map((start,i)=><tr key={start}><th>{time(start)}–{time(GRID[i+1])}</th>{DAYS.map((d,j)=>{const hits=sessions.filter(s=>s.weekday===j+1&&s.start<GRID[i+1]&&s.end>start);return <td key={d}>{hits.map((s,k)=><div key={s.sourceId+'-'+k} className={'preview-session preview-'+s.status+(hits.length>1?' preview-overlap':'')}><strong>{s.label}</strong><small>{time(s.start)}–{time(s.end)}</small><small>{venueMap.get(s.venueId??-1)||'Room not specified'} · {s.status}</small></div>)}</td>})}</tr>)}</tbody></table></div>
    <p className="curriculum-note">Preview only. Orange means pending faculty preference; blue means course-approved preference; green means a scheduled session. Red marks overlapping classes. An empty cell does not guarantee room availability.</p>
   </>}
  </>}
 </section>;
}
