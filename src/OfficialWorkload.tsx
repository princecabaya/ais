import { useCallback, useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { supabase } from './supabase';
import { calculateFacultyWorkload, FULL_TIME_WEEKLY_TARGET } from './workloadRules';

type Faculty={id:string;first_name:string;last_name:string;middle_initial:string|null;department:string;employment_type:string};
type Term={id:number;academic_year:string;semester:number;is_active:boolean};
type Course={id:number;course_code:string;course_title:string;units:number|null};
type Offering={id:number;class_section_id:string;curriculum_course_id:number};
type Section={id:string;block_label:string};
type Venue={id:number;name:string};
type Meeting={faculty_id:string;academic_term_id:number;course_offering_id:number;venue_id:number;weekday:number;start_minute:number;end_minute:number;active:boolean};
type Request={faculty_id:string;course_offering_id:number;academic_term_id:number;status:string;requested_at:string};
type WorkCourse={course_offering_id:number;faculty_id:string;academic_term_id:number;load_category:'regular'|'extra';units_override:string|null;whe:number|null;lec_hours:number|null;lab_hours:number|null;rle_hours:number|null;male_students:number|null;female_students:number|null};
type WorkDetails={faculty_id:string;academic_term_id:number;[key:string]:string|number|null};
type Publication={academic_term_id:number;published_at:string;revision:number};
const FIELDS=['years_at_psu','academic_rank','govt_service_years','bachelors_degree','masters_degree','doctoral_degree','designation','consultation_schedule','research_details','research_time','research_day','extension_details','extension_time','extension_day','production_details','production_time','production_day','cocurricular_details','cocurricular_time','cocurricular_day','administrative_details','administrative_time','administrative_day','research_hours','extension_hours','production_hours','cocurricular_hours','administrative_hours'] as const;
const PROFILE_FIELDS=['years_at_psu','academic_rank','govt_service_years','bachelors_degree','masters_degree','doctoral_degree','designation','consultation_schedule'] as const;
const WORKLOAD_GROUPS=[
 {key:'research',name:'Research',description:'Titles of research currently undertaken',details:'research_details',time:'research_time',day:'research_day',hours:'research_hours'},
 {key:'extension',name:'Extension',description:'Extension activities currently undertaken',details:'extension_details',time:'extension_time',day:'extension_day',hours:'extension_hours'},
 {key:'production',name:'Production',description:'Production activities currently undertaken',details:'production_details',time:'production_time',day:'production_day',hours:'production_hours'},
 {key:'cocurricular',name:'Co-curricular Assignments',description:'Assignment or designation',details:'cocurricular_details',time:'cocurricular_time',day:'cocurricular_day',hours:'cocurricular_hours'},
 {key:'administrative',name:'Administrative / Supervisory',description:'Assignment or designation',details:'administrative_details',time:'administrative_time',day:'administrative_day',hours:'administrative_hours'}
] as const;
const LABELS:Record<string,string>={
 years_at_psu:'Years at PSU',academic_rank:'Academic rank',govt_service_years:'Years in government service',
 bachelors_degree:'Bachelor’s degree',masters_degree:'Master’s degree',doctoral_degree:'Doctoral degree',designation:'Designation',
 consultation_schedule:'Consultation schedule',research_details:'Research activities',extension_details:'Extension activities',
 production_details:'Production activities',cocurricular_details:'Co-curricular assignments',administrative_details:'Administrative assignments',
 research_hours:'Research WHE',extension_hours:'Extension WHE',production_hours:'Production WHE',
 cocurricular_hours:'Co-curricular WHE',administrative_hours:'Administrative WHE'
};
const dayNames=['','M','T','W','Th','F'];
const clock=(n:number)=>{const h=Math.floor(n/60);return `${((h+11)%12)+1}:${String(n%60).padStart(2,'0')}${h<12?' AM':' PM'}`};
const numberOrNull=(s:string)=>s.trim()===''?null:Number(s);
const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const children=(node:Element,name:string)=>Array.from(node.children).filter(el=>el.localName===name&&el.namespaceURI===ns);
function setCell(cell:Element|undefined,value:string){
 if(!cell)return;
 const texts=Array.from(cell.getElementsByTagNameNS(ns,'t'));
 if(texts.length){
  texts[0].textContent=value;
  texts[0].setAttribute('xml:space','preserve');
  for(let i=1;i<texts.length;i++)texts[i].textContent='';
 } else{
  const p=cell.getElementsByTagNameNS(ns,'p')[0];
  if(!p)return;
  const run=cell.ownerDocument.createElementNS(ns,'w:r');
  const t=cell.ownerDocument.createElementNS(ns,'w:t');
  t.setAttribute('xml:space','preserve');t.textContent=value;run.appendChild(t);p.appendChild(run);
 }
}
function put(table:Element,rowIndex:number,cellIndex:number,value:string){
 const row=children(table,'tr')[rowIndex];if(!row)return;
 setCell(children(row,'tc')[cellIndex],value);
}
function clearAndFill(table:Element,startRow:number,originalCount:number,rows:string[][]){
 const tr=children(table,'tr');
 const total=tr[startRow+originalCount];if(!total)throw Error('Workload template rows were not recognized');
 const sample=tr[startRow];
 for(const row of tr.slice(startRow,startRow+originalCount))row.parentNode?.removeChild(row);
 const count=Math.max(rows.length,1);
 for(let i=0;i<count;i++){
  const clone=sample.cloneNode(true) as Element;
  const values=rows[i]||Array(12).fill('');
  const cells=children(clone,'tc');
  values.forEach((v,j)=>setCell(cells[j],v));
  total.parentNode?.insertBefore(clone,total);
 }
}
function setParagraph(par:Element|undefined,value:string){
 if(!par)return;const texts=Array.from(par.getElementsByTagNameNS(ns,'t'));
 if(texts.length){texts[0].textContent=value;for(const t of texts.slice(1))t.textContent='';}
}
type ExportCourse={code:string;title:string;section:string;units:string;room:string;time:string;days:string;whe:number|null;lec:number|null;lab:number|null;rle:number|null;male:number|null;female:number|null;category:'regular'|'extra'};
const blank=(n:number|null)=>n===null?'':String(n);
const sumOrBlank=(a:Array<number|null>)=>a.length===0?'0':a.every(x=>x!==null)?String(a.reduce<number>((s,n)=>s+(n??0),0)):'';
async function exportUsingTemplate(template:File,faculty:Faculty,term:Term,entries:ExportCourse[],details:Record<string,string>,official:boolean){
 const zip=await JSZip.loadAsync(template);
 const entry=zip.file('word/document.xml');if(!entry)throw Error('This is not a valid .docx document');
 const documentXml=await entry.async('string');
 const dom=new DOMParser().parseFromString(documentXml,'application/xml');
 if(dom.getElementsByTagName('parsererror').length)throw Error('The Word template could not be parsed');
 const tables=Array.from(dom.getElementsByTagNameNS(ns,'tbl'));
 if(tables.length<7||children(tables[2],'tr').length<10||children(tables[3],'tr').length<8)throw Error('Please upload the original PSU-ACA-031 Faculty Workload template, not Form A or another document');
 const profile=tables[1];
 const name=[faculty.first_name,faculty.middle_initial,faculty.last_name].filter(Boolean).join(' ').toUpperCase();
 put(profile,0,2,name);
 put(profile,0,5,details.years_at_psu||'');
 put(profile,1,1,'BALABAC CAMPUS');
 put(profile,1,4,details.academic_rank||'');
 put(profile,2,1,faculty.department==='BEEd'?'BACHELOR OF ELEMENTARY EDUCATION':faculty.department==='BSE'?'BACHELOR OF SCIENCE IN ENTREPRENEURSHIP':'CAMPUS ADMINISTRATION');
 put(profile,3,2,({regular:'REGULAR PLANTILLA',tempo:'CONDITIONAL PLANTILLA (TEMPO)',cos:'CONTRACT OF SERVICE',part_time:'PART-TIME'} as Record<string,string>)[faculty.employment_type]||faculty.employment_type);
 put(profile,3,5,details.bachelors_degree||'');
 put(profile,4,1,details.govt_service_years||'');
 put(profile,4,4,details.masters_degree||'');
 put(profile,5,4,details.doctoral_degree||'');
 put(profile,6,4,details.designation||'');
 const body=dom.getElementsByTagNameNS(ns,'body')[0];
 const paragraphs=children(body,'p');
 const semester=term.semester===1?'1ST':'2ND';
 setParagraph(paragraphs[0],`${semester} Semester, School Year ${term.academic_year}`);
 const row=(c:ExportCourse):string[]=>[
 `${c.code}, ${c.title}, ${c.section}`,c.units,c.time,c.days,blank(c.lec),blank(c.lab),blank(c.rle),c.room,
 blank(c.male),blank(c.female),c.male!==null&&c.female!==null?String(c.male+c.female):'',blank(c.whe)
 ];
 const regular=entries.filter(e=>e.category==='regular');
 const extra=entries.filter(e=>e.category==='extra');
 clearAndFill(tables[2],2,6,regular.map(row));
 clearAndFill(tables[3],2,3,extra.map(row));
 const regularTotal=sumOrBlank(regular.map(e=>e.whe));
 const extraTotal=sumOrBlank(extra.map(e=>e.whe));
 const regRows=children(tables[2],'tr');
 setCell(children(regRows[regRows.length-2],'tc')[1],regularTotal);
 const extraRows=children(tables[3],'tr');
 setCell(children(extraRows[Math.max(0,extraRows.length-3)],'tc')[1],extraTotal);
 setCell(children(regRows[regRows.length-1],'tc')[0],'Consultation Schedule: '+(details.consultation_schedule||'_________________________'));
 const total=tables[5];
 put(total,1,5,regularTotal);
 put(total,1,7,extraTotal);
 put(total,2,5,details.research_hours||'');
 put(total,2,7,details.production_hours||'');
 put(total,3,5,details.extension_hours||'');
 put(total,3,7,details.cocurricular_hours||'');
 put(total,4,5,details.administrative_hours||'');
 const required=[regularTotal,extraTotal,...['research_hours','extension_hours','production_hours','cocurricular_hours','administrative_hours'].map(k=>details[k]||'')];
 const canTotal=required.every(v=>v.trim()!==''&&!Number.isNaN(Number(v)));
 const totalWhe=canTotal?String(required.reduce((n,v)=>n+Number(v),0)):'________';
 setCell(children(children(total,'tr')[5],'tc')[3],`TOTAL NO. OF HOURS: ${totalWhe} hrs. `);
 // Blank historical assignment content in template when no structured activity data is supplied.
 const research=children(tables[3],'tr')[children(tables[3],'tr').length-1];
 const researchCells=children(research,'tc');
 if(researchCells.length>=7){setCell(researchCells[0],details.research_details||'');setCell(researchCells[4],details.extension_details||'');}
 const productionRow=children(tables[4],'tr')[2];
 const productionCells=children(productionRow,'tc');
 if(productionCells.length>=7){setCell(productionCells[0],details.production_details||'');setCell(productionCells[4],details.cocurricular_details||'');}
 const adminRow=children(tables[5],'tr')[2];setCell(children(adminRow,'tc')[0],details.administrative_details||'');
 // Official status clearly stated in document without pretending signatories approved it.
 const marker=dom.createElementNS(ns,'w:p'),run=dom.createElementNS(ns,'w:r'),text=dom.createElementNS(ns,'w:t');
 text.textContent=official?'Generated from published AIS timetable — signatures and workload-hour verification required.':'DRAFT — UNPUBLISHED TIMETABLE; NOT FOR OFFICIAL SIGNATURE.';
 run.appendChild(text);marker.appendChild(run);body.insertBefore(marker,body.firstChild);
 zip.file('word/document.xml',new XMLSerializer().serializeToString(dom));
 const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
 a.download=`PSU-ACA-031_${faculty.last_name.replace(/\s+/g,'-')}_${term.academic_year.replace(/\W+/g,'-')}_Sem-${term.semester}${official?'':'_DRAFT'}.docx`;
 a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}

export function OfficialWorkload({facultyId,isAdmin}:{facultyId:string;isAdmin:boolean}){
 const [faculty,setFaculty]=useState<Faculty[]>([]),[terms,setTerms]=useState<Term[]>([]),[courses,setCourses]=useState<Course[]>([]),[offerings,setOfferings]=useState<Offering[]>([]),[sections,setSections]=useState<Section[]>([]),[venues,setVenues]=useState<Venue[]>([]),[meetings,setMeetings]=useState<Meeting[]>([]),[requests,setRequests]=useState<Request[]>([]),[classifications,setClassifications]=useState<WorkCourse[]>([]),[detailRows,setDetailRows]=useState<WorkDetails[]>([]),[publications,setPublications]=useState<Publication[]>([]);
 const [selectedFaculty,setSelectedFaculty]=useState(facultyId);
 const [template,setTemplate]=useState<File|null>(null);
 const [masterError,setMasterError]=useState('');
 const [courseDraft,setCourseDraft]=useState<Record<string,string>>({});
 const [detailDraft,setDetailDraft]=useState<Record<string,string>>({});
 const [profilePanel,setProfilePanel]=useState<'academic'|'activities'|'summary'>('academic');
 const [activityOpen,setActivityOpen]=useState('research');
 const [reason,setReason]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState('');
 const term=terms.find(t=>t.is_active);
 const published=publications.some(p=>p.academic_term_id===term?.id);
 const load=useCallback(async()=>{
  if(!supabase)return;setLoading(true);
  const q=[
   supabase.from('profiles').select('id,first_name,last_name,middle_initial,department,employment_type').eq('status','active').order('last_name'),
   supabase.from('academic_terms').select('id,academic_year,semester,is_active'),
   supabase.from('curriculum_courses').select('id,course_code,course_title,units'),
   supabase.from('course_offerings').select('id,class_section_id,curriculum_course_id'),
   supabase.from('class_sections').select('id,block_label'),
   supabase.from('schedule_venues').select('id,name'),
   supabase.from('schedule_meetings').select('faculty_id,academic_term_id,course_offering_id,venue_id,weekday,start_minute,end_minute,active').eq('active',true),
   supabase.from('faculty_course_requests').select('faculty_id,course_offering_id,academic_term_id,status,requested_at').eq('status','approved'),
   supabase.from('faculty_workload_courses').select('course_offering_id,faculty_id,academic_term_id,load_category,units_override,whe,lec_hours,lab_hours,rle_hours,male_students,female_students'),
   supabase.from('faculty_workload_details').select('*'),
   supabase.from('schedule_publications').select('academic_term_id,published_at,revision')
  ];
  const a=await Promise.all(q);const e=a.find(r=>r.error)?.error;
  if(e)setMessage(e.message);
  else{setFaculty(a[0].data as Faculty[]||[]);setTerms(a[1].data as Term[]||[]);
   setCourses(a[2].data as Course[]||[]);setOfferings(a[3].data as Offering[]||[]);
   setSections(a[4].data as Section[]||[]);setVenues(a[5].data as Venue[]||[]);
   setMeetings(a[6].data as Meeting[]||[]);setRequests(a[7].data as Request[]||[]);
   setClassifications(a[8].data as WorkCourse[]||[]);setDetailRows(a[9].data as WorkDetails[]||[]);
   setPublications(a[10].data as Publication[]||[]);}
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{
  let mounted=true;
  const fetchMaster=async()=>{
   if(!supabase)return;
   const {data,error}=await supabase.storage.from('faculty-workload-templates').download('PSU-ACA-031-master.docx');
   if(!mounted)return;
   if(error){setMasterError('The official university master template is unavailable. Ask the campus administrator to restore it.');return;}
   setTemplate(new File([data],'PSU-ACA-031-master.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
   setMasterError('');
  };
  void fetchMaster();
  return()=>{mounted=false};
 },[]);
 const fac=faculty.find(f=>f.id===selectedFaculty);
 const rows=useMemo(()=>{
  const cMap=new Map(courses.map(c=>[c.id,c])),oMap=new Map(offerings.map(o=>[o.id,o])),sMap=new Map(sections.map(s=>[s.id,s])),vMap=new Map(venues.map(v=>[v.id,v]));
  const approvedRequests=requests.filter(r=>r.faculty_id===selectedFaculty&&r.academic_term_id===term?.id&&r.status==='approved');
  const approved=new Set(approvedRequests.map(r=>r.course_offering_id));
  const requestByOffering=new Map(approvedRequests.map(r=>[r.course_offering_id,r]));
  const byOffering=new Map<number,Meeting[]>();
  for(const m of meetings)if(m.faculty_id===selectedFaculty&&m.academic_term_id===term?.id&&approved.has(m.course_offering_id)){
   byOffering.set(m.course_offering_id,[...(byOffering.get(m.course_offering_id)||[]),m]);
  }
  return Array.from(byOffering,([id,slots])=>{
   const o=oMap.get(id),c=cMap.get(o?.curriculum_course_id??-1),s=sMap.get(o?.class_section_id??''),w=classifications.find(x=>x.course_offering_id===id);
   const sorted=[...slots].sort((a,b)=>a.weekday-b.weekday),first=sorted[0];
   return {id,code:c?.course_code||'—',title:c?.course_title||'—',section:s?.block_label||'—',units:c?.units??null,room:vMap.get(first.venue_id)?.name||'—',
    curriculumCourseId:c?.id??-1,sortKey:requestByOffering.get(id)?.requested_at||'9999',
    days:sorted.map(x=>dayNames[x.weekday]).join(''),time:clock(first.start_minute)+'–'+clock(first.end_minute),
    weeklyMinutes:slots.reduce((n,x)=>n+x.end_minute-x.start_minute,0),w};
  }).sort((a,b)=>a.sortKey.localeCompare(b.sortKey)||a.id-b.id);
 },[courses,offerings,sections,venues,meetings,requests,classifications,selectedFaculty,term?.id]);
 const fullTime=fac?.employment_type!=='part_time';
 const computed=calculateFacultyWorkload(rows.map(r=>({
   id:r.id,curriculumCourseId:r.curriculumCourseId,courseCode:r.code,courseTitle:r.title,units:r.units,
   weeklyTeachingHours:r.weeklyMinutes/60,sortKey:r.sortKey
 })),fullTime);
 const computedById=new Map(computed.map(r=>[r.id,r]));
 const regularCourses=computed.filter(c=>c.category==='regular');
 const extraCourses=computed.filter(c=>c.category==='extra');
 const regularCreditComplete=regularCourses.every(c=>c.creditedHours!==null);
 const regularCreditedHours=regularCreditComplete?regularCourses.reduce((n,c)=>n+(c.creditedHours||0),0):null;
 const extraCreditedHours=extraCourses.every(c=>c.creditedHours!==null)?extraCourses.reduce((n,c)=>n+(c.creditedHours||0),0):null;
 const sharedPreparations=computed.filter(c=>c.sharedPreparation).length;
 const initialDetails=detailRows.find(d=>d.faculty_id===selectedFaculty&&d.academic_term_id===term?.id);
 const details:Record<string,string>={};for(const k of FIELDS){const v=detailDraft[k]??String(initialDetails?.[k]??'');details[k]=WORKLOAD_GROUPS.some(g=>g.details===k||g.time===k||g.day===k)&&v==='0'?'':v;}
 const selectedRow=rows.find(r=>String(r.id)===courseDraft.id);
 function pickRow(id:number){
  const r=rows.find(x=>x.id===id);if(!r)return;
  setCourseDraft({id:String(id),category:computedById.get(id)?.category||'regular',units_override:r.w?.units_override||'',
   whe:computedById.get(id)?.creditedHours==null?'':String(computedById.get(id)!.creditedHours),
   lec:r.w?.lec_hours==null?'':String(r.w.lec_hours),lab:r.w?.lab_hours==null?'':String(r.w.lab_hours),
   rle:r.w?.rle_hours==null?'':String(r.w.rle_hours),male:r.w?.male_students==null?'':String(r.w.male_students),
   female:r.w?.female_students==null?'':String(r.w.female_students)});
  setReason('');
 }
 async function saveCourse(){
  if(!supabase||!selectedRow)return;
  setBusy(true);setMessage('');
  const {error}=await supabase.rpc('admin_save_workload_course',{
   p_offering_id:selectedRow.id,p_category:computedById.get(selectedRow.id)?.category||'regular',
   p_units_override:courseDraft.units_override||null,p_whe:computedById.get(selectedRow.id)?.creditedHours??null,
   p_lec:numberOrNull(courseDraft.lec||''),p_lab:numberOrNull(courseDraft.lab||''),p_rle:numberOrNull(courseDraft.rle||''),
   p_male:numberOrNull(courseDraft.male||''),p_female:numberOrNull(courseDraft.female||''),p_reason:reason.trim()
  });
  if(error)setMessage(error.message);else{setMessage('Workload classification and values saved.');setCourseDraft({});await load();}
  setBusy(false);
 }
 async function saveDetails(){
  if(!supabase)return;setBusy(true);setMessage('');
  const {error}=await supabase.rpc('save_faculty_workload_profile',{p_faculty_id:selectedFaculty,p_details:details});
  if(error)setMessage(error.message);else{setMessage('Faculty academic profile and activity details saved. Administrator-approved WHE values are preserved.');setDetailDraft({});await load();}
  setBusy(false);
 }
 async function download(){
  if(!fac||!term||!template){setMessage('The saved PSU-ACA-031 master template is unavailable. Contact an administrator.');return;}
  setBusy(true);setMessage('');
  try{
   const entries:ExportCourse[]=rows.map(r=>({
    code:r.code,title:r.title,section:r.section,units:r.w?.units_override||String(r.units??''),room:r.room,time:r.time,days:r.days,
    whe:computedById.get(r.id)?.creditedHours??null,lec:r.w?.lec_hours??null,lab:r.w?.lab_hours??null,rle:r.w?.rle_hours??null,
    male:r.w?.male_students??null,female:r.w?.female_students??null,category:computedById.get(r.id)?.category||'regular'
   }));
   await exportUsingTemplate(template,fac,term,entries,details,published);
   setMessage('Editable Word document generated. Review missing fields, equivalencies, and signatures before approving.');
  }catch(e){setMessage((e as Error).message);}
  setBusy(false);
 }
 const setCourse=(name:string,val:string)=>setCourseDraft(prev=>({...prev,[name]:val}));
 return <section className="panel official-workload" id="official-workload">
  <div className="selection-top"><div><span className="kicker">PSU-ACA-031 · FACULTY WORKLOAD</span><h2>Editable Official Workload</h2><p>Generate the university Word layout using approved teaching allocations and the actual PSU template.</p></div><button className="ghost" onClick={()=>void load()}>Refresh</button></div>
  <p className="curriculum-note">{term?`${term.academic_year} · Semester ${term.semester}`:'No active term'} · <strong>{published?'Timetable published':'Unpublished draft'}</strong>. Exported documents remain editable and require official review and signatures.</p>
  {isAdmin&&<label className="workload-select">Faculty member<select value={selectedFaculty} onChange={e=>{setSelectedFaculty(e.target.value);setCourseDraft({});setDetailDraft({})}}>{faculty.map(f=><option key={f.id} value={f.id}>{f.last_name}, {f.first_name} · {f.department}</option>)}</select></label>}
  {loading?<p>Loading approved faculty schedules…</p>:<>
   <h3>Teaching Load and Preparation Credits</h3>
   <div className="workload-policy-note">
    <strong>Campus workload calculation</strong>
    <p>Full-time faculty (Regular, Tempo and COS): first 6 approved, scheduled course sections are regular load; course 7 onward is extra load (7th–8th expected). The sequence follows the original course-request date. The 5th and 6th regular sections earn an additional credit unit (2 credited hours) if they represent a new subject preparation.</p>
    <p>Teaching time counts for each student block; preparation time counts once per distinct course code. Extra load counts actual teaching hours only and is never doubled. The full-time target is <strong>40 credited hours weekly</strong>.</p>
   </div>
   <div className="workload-summary-grid workload-policy-metrics">
    <div><span>Regular course sections</span><strong>{regularCourses.length}</strong></div>
    <div><span>Extra course sections</span><strong>{extraCourses.length}</strong></div>
    <div><span>Regular credited hours</span><strong>{regularCreditedHours===null?'Verify units':regularCreditedHours.toFixed(1)+(fullTime?' / '+FULL_TIME_WEEKLY_TARGET:' hrs')}</strong></div>
    <div><span>Extra teaching hours (not doubled)</span><strong>{extraCreditedHours===null?'Verify units':extraCreditedHours.toFixed(1)}</strong></div>
    <div><span>Shared preparations</span><strong>{sharedPreparations}</strong></div>
   </div>
   {!fullTime&&<p className="curriculum-note">Part-time appointments do not have an automatic 40-hour minimum. Teaching hours appear without automatic preparation credits; administrator review remains required.</p>}
   {computed.length>8&&fullTime&&<p className="notice">More than eight course sections are approved. The 9th and subsequent sections are shown as extra teaching load, but require additional administrative review.</p>}
   <div className="curriculum-table-wrap"><table className="curriculum-table"><thead><tr><th># · Subject / Block</th><th>Schedule / Room</th><th>Teaching hrs</th><th>Prep hrs</th><th>5th/6th bonus</th><th>Credited hrs</th><th>Classification</th>{isAdmin&&<th>Details</th>}</tr></thead><tbody>{rows.map(r=>{const c=computedById.get(r.id)!;return <tr key={r.id}>
    <td><strong>#{c.position} · {r.code} · {r.section}</strong><p>{r.title}</p></td>
    <td>{r.days} · {r.time}<p>{r.room}</p></td>
    <td>{c.teachingHours.toFixed(1)}</td><td>{c.preparationHours.toFixed(1)}{c.sharedPreparation&&<p>Shared preparation</p>}</td>
    <td>{c.bonusHours.toFixed(1)}</td><td><strong>{c.creditedHours===null?'Verify units':c.creditedHours.toFixed(1)}</strong></td>
    <td><span className={c.category==='extra'?'workload-extra-tag':'workload-regular-tag'}>{c.category==='extra'?'Extra load':'Regular load'}</span></td>
    {isAdmin&&<td><button type="button" className="ghost" onClick={()=>pickRow(r.id)}>Review</button></td>}
   </tr>})}</tbody></table></div>
   {rows.length===0&&<p>No approved, scheduled courses found for this faculty member. Approve courses and their room schedules first.</p>}
   {isAdmin&&selectedRow&&<div className="workload-edit"><h3>Review: {selectedRow.code} · {selectedRow.section}</h3><p className="curriculum-note">The load category and computed hours are set by the campus rule. This form edits supporting details (units notation, enrollment and lecture/laboratory hours); administrator justification is recorded.</p>
    <div className="workload-fields">
     <label>Automatic classification<input disabled value={computedById.get(selectedRow.id)?.category==='extra'?'Extra teaching load':'Regular teaching load'}/></label><label>Calculated credited hours<input disabled value={computedById.get(selectedRow.id)?.creditedHours??'Verify units'}/></label>
     {([{k:'units_override',l:'Approved units notation (optional)'},{k:'lec',l:'Lecture contact hours'},{k:'lab',l:'Lab contact hours'},{k:'rle',l:'RLE hours'},{k:'male',l:'Male students'},{k:'female',l:'Female students'}] as const).map(x=><label key={x.k}>{x.l}<input type={x.k==='units_override'?'text':'number'} min={x.k==='units_override'?undefined:0} step={x.k==='male'||x.k==='female'?1:'0.5'} value={courseDraft[x.k]||''} onChange={e=>setCourse(x.k,e.target.value)}/></label>)}
    </div>
    <label>Administrator justification<input minLength={10} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Verified teaching load against approved PSU faculty workload guidance"/></label>
    <div className="availability-dialog-actions"><button className="primary" disabled={busy||reason.trim().length<10} onClick={()=>void saveCourse()}>Save workload entry</button><button className="ghost" onClick={()=>setCourseDraft({})}>Cancel</button></div>
   </div>}
   <section className="workload-self-service">
    <div className="workload-service-header">
     <div><span className="kicker">PSU-ACA-031 · SECTIONS A AND B</span><h3>Faculty Profile and Other Assignments</h3><p>Complete the form one section at a time. Your saved information will be used in the faculty workload document.</p></div>
     <button type="button" className="ghost" disabled={busy} onClick={()=>void saveDetails()}>{busy?'Saving…':'Save my information'}</button>
    </div>
    <div className="workload-section-nav" role="group" aria-label="Workload details">
     <button type="button" className={profilePanel==='academic'?'selected':''} onClick={()=>setProfilePanel('academic')}>A. Academic Profile</button>
     <button type="button" className={profilePanel==='activities'?'selected':''} onClick={()=>setProfilePanel('activities')}>B. Other Assignments</button>
     <button type="button" className={profilePanel==='summary'?'selected':''} onClick={()=>setProfilePanel('summary')}>Workload Summary</button>
    </div>
    {profilePanel==='academic'&&<div className="workload-profile-pane">
     <div className="workload-profile-intro"><h4>A. Academic Profile</h4><p>Identity and appointment details already recorded in your faculty account are displayed automatically.</p></div>
     <div className="workload-identity">
      <div><small>Faculty name</small><strong>{fac?[fac.last_name,fac.first_name,fac.middle_initial].filter(Boolean).join(', ').toUpperCase():'—'}</strong></div>
      <div><small>Campus</small><strong>PSU Balabac Campus</strong></div>
      <div><small>Department</small><strong>{fac?.department||'—'}</strong></div>
      <div><small>Appointment</small><strong>{fac?.employment_type||'—'}</strong></div>
     </div>
     <div className="workload-profile-grid">
      {PROFILE_FIELDS.map(k=><label key={k}>{LABELS[k]}<input type="text" maxLength={1200} value={details[k]==='0'?'':details[k]} onChange={e=>setDetailDraft(prev=>({...prev,[k]:e.target.value}))} placeholder={k==='consultation_schedule'?'e.g., Tuesday · 1:00–3:00 PM':'Enter '+LABELS[k].toLowerCase()}/></label>)}
     </div>
    </div>}
    {profilePanel==='activities'&&<div className="workload-profile-pane">
     <h4>B. Research, Extension and Other Assignments</h4>
     <p className="curriculum-note">The PSU template lists an activity or designation alongside its time and day. Leave fields blank when not applicable. WHE is reviewed by the administrator.</p>
     <div className="workload-activity-list">{WORKLOAD_GROUPS.map((g,i)=><section key={g.key} className="workload-activity-card">
      <button type="button" className="workload-activity-heading" aria-expanded={activityOpen===g.key} onClick={()=>setActivityOpen(activityOpen===g.key?'':g.key)}>
       <span><strong>{i+2}. {g.name}</strong><small>{details[g.details]&&details[g.details]!=='0'?details[g.details]:'No activity recorded'}</small></span>
       <span>{activityOpen===g.key?'▲':'▼'}</span>
      </button>
      {activityOpen===g.key&&<div className="workload-activity-fields">
       <label className="activity-description">{g.description}<textarea rows={3} maxLength={1200} value={details[g.details]==='0'?'':details[g.details]} onChange={e=>setDetailDraft(prev=>({...prev,[g.details]:e.target.value}))} placeholder="Enter activity, title, or designation"/></label>
       <label>Time<input value={details[g.time]==='0'?'':details[g.time]} maxLength={1200} onChange={e=>setDetailDraft(prev=>({...prev,[g.time]:e.target.value}))} placeholder="e.g., 2:00–4:00 PM"/></label>
       <label>Day<input value={details[g.day]==='0'?'':details[g.day]} maxLength={1200} onChange={e=>setDetailDraft(prev=>({...prev,[g.day]:e.target.value}))} placeholder="e.g., Thursday"/></label>
       <label>{LABELS[g.hours]} <small>{isAdmin?'Administrator verified':'Administrator controlled'}</small><input type="number" min={0} max={80} step=".5" disabled={!isAdmin} value={details[g.hours]} onChange={e=>setDetailDraft(prev=>({...prev,[g.hours]:e.target.value}))} placeholder="Not yet verified"/></label>
      </div>}
     </section>)}</div>
    </div>}
    {profilePanel==='summary'&&<div className="workload-profile-pane">
     <h4>Summary of Workload</h4>
     <p className="curriculum-note">Approved equivalent hours are shown separately from actual weekly teaching time. No unverified workload hours are assumed.</p>
     <div className="workload-summary-grid">
      <div><span>Scheduled teaching time</span><strong>{rows.length?String((rows.reduce((n,r)=>n+r.weeklyMinutes,0)/60).toFixed(1))+' hrs/wk':'Not available'}</strong></div>
      <div><span>Regular teaching WHE</span><strong>{regularCreditedHours===null?'Pending verification':String(regularCreditedHours)}</strong></div>
      <div><span>Extra teaching WHE</span><strong>{extraCreditedHours===null?'Pending verification':String(extraCreditedHours)}</strong></div>
      {WORKLOAD_GROUPS.map(g=><div key={g.key}><span>{g.name} WHE</span><strong>{details[g.hours]!==''?details[g.hours]:'Pending verification'}</strong></div>)}
     </div>
    </div>}
    <div className="workload-panel-actions">
     <p>Details are saved to your faculty record for {term?term.academic_year+' · Semester '+term.semester:'the active semester'}.</p>
     <button className="primary" type="button" disabled={busy} onClick={()=>void saveDetails()}>{busy?'Saving…':'Save faculty information'}</button>
    </div>
   </section>
   <div className="workload-download">
    <h3>Generate Faculty Workload</h3>
    <p>AIS automatically fills the stored PSU-ACA-031 Word template with this instructor's approved classes, rooms and meeting times.</p>
    <p className="curriculum-note"><strong>University template:</strong> {template?'Ready for automatic generation':'Loading or unavailable'}.</p>
    {masterError&&<div className="notice" role="alert">{masterError}</div>}
    {!published&&<p className="curriculum-note">The semester timetable is not yet published. The generated Word document will be marked as a draft.</p>}
    {rows.some(r=>!r.w)&&<p className="curriculum-note">Workload categories and credited hours are computed from approved course schedules. Missing course units remain blank until verified.</p>}
    <button className="primary" type="button" disabled={busy||!template||!fac||rows.length===0} onClick={()=>void download()}>{busy?'Generating…':'Generate Faculty Workload (.docx)'}</button>
    <p className="curriculum-note">The file is editable. Official workload equivalents, missing counts, signatories and approvals still require review.</p>
   </div>
  </>}
  {message&&<div className="notice" role="status">{message}</div>}
 </section>;
}
