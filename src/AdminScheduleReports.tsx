import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import ExcelJS from 'exceljs';

type Faculty={id:string;first_name:string;last_name:string;middle_initial:string|null;department:string};
type Term={id:number;academic_year:string;semester:number;is_active:boolean};
type Course={id:number;course_code:string;course_title:string};
type Offering={id:number;academic_term_id:number;class_section_id:string;curriculum_course_id:number};
type Block={id:string;block_label:string;program:string};
type Venue={id:number;name:string};
type Request={id:number;academic_term_id:number;faculty_id:string;course_offering_id:number;status:string;preferred_pattern:string|null;preferred_start_minute:number|null;preferred_pathfit_weekday:number|null;preferred_venue_id:number|null;preference_rank:number};
type Proposal={id:number;academic_term_id:number;faculty_id:string;course_offering_id:number;status:string};
type Meeting={id:number;academic_term_id:number;faculty_id:string;course_offering_id:number;class_section_id:string;venue_id:number;weekday:number;start_minute:number;end_minute:number;active:boolean};
type FacultyRow={faculty:string;department:string;course:string;title:string;block:string;days:string;time:string;venue:string;status:string;sortKey:string;facultyId:string};
type RoomRow={venue:string;day:number;start:number;end:number;course:string;block:string;faculty:string;status:string};
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const clock=(n:number)=>{const h=Math.floor(n/60),m=String(n%60).padStart(2,'0');return `${((h+11)%12)+1}:${m} ${h<12?'AM':'PM'}`};
const dayLabel=(p:string|null,d:number|null)=>{
 if(p==='FIELD')return 'Field placement · no fixed session';
 if(p==='MW')return 'Mon/Wed';
 if(p==='TTH')return 'Tue/Thu';
 if(p==='NSTP')return 'Friday';
 if(p==='PATHFIT')return DAYS[(d??1)-1];
 return 'Not selected';
};
const patternDuration=(pattern:string|null)=>pattern==='NSTP'?180:pattern==='PATHFIT'?120:90;

async function buildWorkbook(title:string,term:string,headers:string[],data:(string|number)[][],sheetName:string){
 const book=new ExcelJS.Workbook();
 book.creator='PSU Balabac Faculty Scheduling System';
 book.created=new Date();
 const sheet=book.addWorksheet(sheetName,{views:[{state:'frozen',ySplit:4}]});
 const maxCol=headers.length;
 sheet.mergeCells(1,1,1,maxCol);
 const heading=sheet.getCell(1,1);heading.value='PALAWAN STATE UNIVERSITY · BALABAC CAMPUS';heading.font={bold:true,color:{argb:'FFFFFFFF'},size:15};heading.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF174F7C'}};heading.alignment={vertical:'middle'};
 sheet.getRow(1).height=32;
 sheet.mergeCells(2,1,2,maxCol);
 const subtitle=sheet.getCell(2,1);subtitle.value=title+' · '+term;subtitle.font={bold:true,color:{argb:'FF174F7C'},size:11};subtitle.alignment={vertical:'middle'};
 sheet.getRow(2).height=26;
 const head=sheet.getRow(4);head.values=[, ...headers];
 head.eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF2B75AA'}};cell.alignment={vertical:'middle',wrapText:true};cell.border={bottom:{style:'thin',color:{argb:'FFB8D5EA'}}}});
 head.height=30;
 data.forEach((values,i)=>{
  const row=sheet.addRow(values);
  row.height=34;
  row.eachCell(cell=>{cell.alignment={vertical:'middle',wrapText:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:i%2===0?'FFFFFFFF':'FFF1F7FC'}};cell.border={bottom:{style:'hair',color:{argb:'FFDCE8F2'}}}});
 });
 const widths=headers.map(h=>h.toLowerCase().includes('faculty')?29:h.toLowerCase().includes('title')?38:h.toLowerCase().includes('room')?22:h.toLowerCase().includes('time')?24:h.toLowerCase().includes('block')?24:20);
 sheet.columns=widths.map(width=>({width}));
 if(data.length)sheet.autoFilter={from:{row:4,column:1},to:{row:4+data.length,column:maxCol}};
 sheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,paperSize:9};
 const bytes=await book.xlsx.writeBuffer();
 const blob=new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');
 a.href=url;a.download=title.replace(/[^a-z0-9]+/gi,'_')+'_'+term.replace(/[^a-z0-9]+/gi,'_')+'.xlsx';
 a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function AdminScheduleReports(){
 const [faculty,setFaculty]=useState<Faculty[]>([]);
 const [terms,setTerms]=useState<Term[]>([]);
 const [courses,setCourses]=useState<Course[]>([]);
 const [offerings,setOfferings]=useState<Offering[]>([]);
 const [blocks,setBlocks]=useState<Block[]>([]);
 const [venues,setVenues]=useState<Venue[]>([]);
 const [requests,setRequests]=useState<Request[]>([]);
 const [proposals,setProposals]=useState<Proposal[]>([]);
 const [meetings,setMeetings]=useState<Meeting[]>([]);
 const [view,setView]=useState<'faculty'|'rooms'>('faculty');
 const [facultyFilter,setFacultyFilter]=useState('ALL');
 const [roomFilter,setRoomFilter]=useState('ALL');
 const [dayFilter,setDayFilter]=useState('ALL');
 const [search,setSearch]=useState('');
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const term=terms.find(t=>t.is_active);
 const label=term?`${term.academic_year} · Semester ${term.semester}`:'Active semester';
 const load=useCallback(async()=>{
  if(!supabase)return;
  setLoading(true);setError('');
  const [f,t,c,o,b,v,r,p,m]=await Promise.all([
   supabase.from('profiles').select('id,first_name,last_name,middle_initial,department').eq('status','active').order('last_name'),
   supabase.from('academic_terms').select('id,academic_year,semester,is_active'),
   supabase.from('curriculum_courses').select('id,course_code,course_title'),
   supabase.from('course_offerings').select('id,academic_term_id,class_section_id,curriculum_course_id'),
   supabase.from('class_sections').select('id,block_label,program'),
   supabase.from('schedule_venues').select('id,name').eq('active',true).order('name'),
   supabase.from('faculty_course_requests').select('id,academic_term_id,faculty_id,course_offering_id,status,preferred_pattern,preferred_start_minute,preferred_pathfit_weekday,preferred_venue_id,preference_rank').in('status',['pending','approved']),
   supabase.from('schedule_proposals').select('id,academic_term_id,faculty_id,course_offering_id,status'),
   supabase.from('schedule_meetings').select('id,academic_term_id,faculty_id,course_offering_id,class_section_id,venue_id,weekday,start_minute,end_minute,active').eq('active',true)
  ]);
  const problem=[f,t,c,o,b,v,r,p,m].find(x=>x.error)?.error;
  if(problem)setError(problem.message);
  else{
   setFaculty(f.data as Faculty[]||[]);setTerms(t.data as Term[]||[]);
   setCourses(c.data as Course[]||[]);setOfferings(o.data as Offering[]||[]);
   setBlocks(b.data as Block[]||[]);setVenues(v.data as Venue[]||[]);
   setRequests(r.data as Request[]||[]);setProposals(p.data as Proposal[]||[]);
   setMeetings(m.data as Meeting[]||[]);
  }setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 const data=useMemo(()=>{
  const fmap=new Map(faculty.map(f=>[f.id,f]));
  const cmap=new Map(courses.map(c=>[c.id,c]));
  const omap=new Map(offerings.map(o=>[o.id,o]));
  const bmap=new Map(blocks.map(b=>[b.id,b]));
  const vmap=new Map(venues.map(v=>[v.id,v.name]));
  const name=(id:string)=>{const f=fmap.get(id);return f?`${f.last_name}, ${f.first_name} ${f.middle_initial||''}`.trim():'Unknown faculty'};
  const byOffering=new Map<number,Meeting[]>();
  meetings.filter(m=>m.academic_term_id===term?.id).forEach(m=>byOffering.set(m.course_offering_id,[...(byOffering.get(m.course_offering_id)||[]),m]));
  const facultyRows:FacultyRow[]=requests.filter(r=>r.academic_term_id===term?.id).map(r=>{
   const o=omap.get(r.course_offering_id);const c=cmap.get(o?.curriculum_course_id??-1);
   const block=bmap.get(o?.class_section_id??'');
   const sessions=byOffering.get(r.course_offering_id)?.filter(m=>m.faculty_id===r.faculty_id);
   const approvedSchedule=!!sessions?.length;
   const first=sessions?.[0];
   const desc=approvedSchedule
    ?sessions!.map(m=>DAYS[m.weekday-1]).join(' / ')
    :dayLabel(r.preferred_pattern,r.preferred_pathfit_weekday);
   const start=approvedSchedule?first!.start_minute:r.preferred_start_minute;
   const end=start===null?null:start+(approvedSchedule?first!.end_minute-first!.start_minute:patternDuration(r.preferred_pattern));
   const where=approvedSchedule?vmap.get(first!.venue_id):r.preferred_venue_id===null?null:vmap.get(r.preferred_venue_id);
   const schedulePending=proposals.some(p=>p.faculty_id===r.faculty_id&&p.course_offering_id===r.course_offering_id&&p.status==='pending');
   const status=approvedSchedule?'Approved schedule':r.status==='approved'?(schedulePending?'Course approved · schedule pending':'Course approved · unscheduled'):'Course request pending';
   return {
    faculty:name(r.faculty_id),department:fmap.get(r.faculty_id)?.department||'—',
    course:c?.course_code||'—',title:c?.course_title||'Untitled course',block:block?.block_label||'Block',
    days:desc,time:r.preferred_pattern==='FIELD'&&!approvedSchedule?'No fixed weekly hours':start===null||end===null?'Not selected':clock(start)+' – '+clock(end),
    venue:r.preferred_pattern==='FIELD'&&!approvedSchedule?'No room required':where||'Not selected',status,sortKey:name(r.faculty_id),facultyId:r.faculty_id
   };
  }).sort((a,b)=>a.sortKey.localeCompare(b.sortKey)||a.block.localeCompare(b.block,undefined,{numeric:true})||a.course.localeCompare(b.course));
  const roomRows:RoomRow[]=meetings.filter(m=>m.academic_term_id===term?.id).map(m=>{
   const o=omap.get(m.course_offering_id);
   return {venue:vmap.get(m.venue_id)||'Venue',day:m.weekday,start:m.start_minute,end:m.end_minute,
    course:cmap.get(o?.curriculum_course_id??-1)?.course_code||'—',
    block:bmap.get(m.class_section_id)?.block_label||'Block',faculty:name(m.faculty_id),status:'Approved booking'};
  }).sort((a,b)=>a.venue.localeCompare(b.venue,undefined,{numeric:true})||a.day-b.day||a.start-b.start);
  return {facultyRows,roomRows};
 },[faculty,terms,courses,offerings,blocks,venues,requests,proposals,meetings,term?.id]);
 const filteredFaculty=data.facultyRows.filter(r=>(facultyFilter==='ALL'||r.facultyId===facultyFilter)&&
  (!search||[r.faculty,r.course,r.title,r.block,r.venue].some(v=>v.toLowerCase().includes(search.toLowerCase()))));
 const filteredRooms=data.roomRows.filter(r=>(roomFilter==='ALL'||r.venue===roomFilter)&&(dayFilter==='ALL'||r.day===Number(dayFilter))&&
  (!search||[r.faculty,r.course,r.block,r.venue].some(v=>v.toLowerCase().includes(search.toLowerCase()))));
 async function exportExcel(){
  if(!term)return;setBusy(true);setError('');
  try{
   if(view==='faculty'){
    await buildWorkbook('Faculty Course and Schedule Report',label,
     ['Faculty','Department','Course','Course Title','Student Block','Days','Time','Preferred / Assigned Venue','Approval Status'],
     filteredFaculty.map(r=>[r.faculty,r.department,r.course,r.title,r.block,r.days,r.time,r.venue,r.status]),'Faculty Courses');
   }else{
    await buildWorkbook('Schedules per Room',label,
     ['Room / Venue','Day','Start Time','End Time','Course','Student Block','Faculty','Status'],
     filteredRooms.map(r=>[r.venue,DAYS[r.day-1],clock(r.start),clock(r.end),r.course,r.block,r.faculty,r.status]),'Room Schedule');
   }
  }catch(e){setError(e instanceof Error?e.message:'Could not generate Excel workbook')}
  setBusy(false);
 }
 return <section className="panel admin-schedule-reports" id="admin-schedule-reports">
  <div className="selection-top">
   <div><span className="kicker">ADMINISTRATOR · SCHEDULING REPORTS</span><h2>Faculty and Room Schedule Reports</h2>
    <p>Review proposed faculty workloads and confirmed classroom occupancy in a printable, exportable table.</p></div>
   <button type="button" className="ghost" onClick={()=>void load()} disabled={loading}>Refresh reports</button>
  </div>
  <p className="curriculum-note">{label}. Pending requests are shown as preferences only; approved room bookings are listed separately.</p>
  <div className="curriculum-tabs">
   <button type="button" className={view==='faculty'?'curriculum-tab selected':'curriculum-tab'} onClick={()=>{setView('faculty');setSearch('')}}>Faculty · Courses and Schedules</button>
   <button type="button" className={view==='rooms'?'curriculum-tab selected':'curriculum-tab'} onClick={()=>{setView('rooms');setSearch('')}}>Schedules per Room</button>
  </div>
  <div className="admin-report-controls">
   {view==='faculty'?<label>Faculty<select value={facultyFilter} onChange={e=>setFacultyFilter(e.target.value)}><option value="ALL">All faculty</option>{faculty.map(f=><option key={f.id} value={f.id}>{f.last_name}, {f.first_name}</option>)}</select></label>:
   <><label>Room<select value={roomFilter} onChange={e=>setRoomFilter(e.target.value)}><option value="ALL">All rooms / venues</option>{venues.map(v=><option key={v.id} value={v.name}>{v.name}</option>)}</select></label>
    <label>Day<select value={dayFilter} onChange={e=>setDayFilter(e.target.value)}><option value="ALL">Monday–Friday</option>{DAYS.map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></label></>}
   <label>Search<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Course, block, faculty or room"/></label>
   <button type="button" className="primary" disabled={busy||loading||!term} onClick={()=>void exportExcel()}>{busy?'Preparing workbook…':'Export to Excel (.xlsx)'}</button>
  </div>
  {loading?<p>Loading administrator reports…</p>:error?<div className="notice" role="alert">{error}</div>:view==='faculty'?<>
   <p className="curriculum-note">{filteredFaculty.length} faculty course selections. The schedule column shows the approved meeting when available, otherwise the instructor's requested preference.</p>
   <div className="admin-report-table-wrap"><table className="admin-report-table">
    <thead><tr>{['Faculty','Department','Course','Subject','Student block','Days','Time','Room','Status'].map(c=><th key={c}>{c}</th>)}</tr></thead>
    <tbody>{filteredFaculty.map((r,i)=><tr key={r.facultyId+'-'+r.course+'-'+r.block+'-'+i}>
     <td><strong>{r.faculty}</strong></td><td>{r.department}</td><td>{r.course}</td><td>{r.title}</td><td>{r.block}</td><td>{r.days}</td><td>{r.time}</td><td>{r.venue}</td><td><span className={'admin-report-status '+(r.status==='Approved schedule'?'confirmed':r.status.startsWith('Course approved')?'inreview':'requested')}>{r.status}</span></td>
    </tr>)}</tbody></table>
    {!filteredFaculty.length&&<p className="selection-empty">No course selections match the selected filters.</p>}
   </div>
  </>:<>
   <p className="curriculum-note">{filteredRooms.length} approved weekly meeting sessions. Only approved room bookings appear in this report, not pending room preferences.</p>
   <div className="admin-report-table-wrap"><table className="admin-report-table">
    <thead><tr>{['Room / Venue','Day','Start','End','Course','Student block','Assigned faculty','Status'].map(c=><th key={c}>{c}</th>)}</tr></thead>
    <tbody>{filteredRooms.map((r,i)=><tr key={r.venue+'-'+r.day+'-'+r.start+'-'+r.course+'-'+i}>
     <td><strong>{r.venue}</strong></td><td>{DAYS[r.day-1]}</td><td>{clock(r.start)}</td><td>{clock(r.end)}</td><td>{r.course}</td><td>{r.block}</td><td>{r.faculty}</td><td><span className="admin-report-status confirmed">{r.status}</span></td>
    </tr>)}</tbody></table>
    {!filteredRooms.length&&<p className="selection-empty">No approved meetings match these filters.</p>}
   </div>
  </>}
  <p className="curriculum-note">Excel exports include the currently filtered rows. Reopen or refresh the tab after approvals or schedule changes for the latest information.</p>
 </section>;
}
