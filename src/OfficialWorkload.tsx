import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import JSZip from 'jszip';
import { supabase } from './supabase';

type Faculty={id:string;first_name:string;last_name:string;middle_initial:string|null;department:string;employment_type:string};
type Term={id:number;academic_year:string;semester:number;is_active:boolean};
type Course={id:number;course_code:string;course_title:string;units:number|null};
type Offering={id:number;class_section_id:string;curriculum_course_id:number};
type Section={id:string;block_label:string};
type Venue={id:number;name:string};
type Meeting={faculty_id:string;academic_term_id:number;course_offering_id:number;venue_id:number;weekday:number;start_minute:number;end_minute:number;active:boolean};
type Request={faculty_id:string;course_offering_id:number;academic_term_id:number;status:string};
type WorkCourse={course_offering_id:number;faculty_id:string;academic_term_id:number;load_category:'regular'|'extra';units_override:string|null;whe:number|null;lec_hours:number|null;lab_hours:number|null;rle_hours:number|null;male_students:number|null;female_students:number|null};
type WorkDetails={faculty_id:string;academic_term_id:number;[key:string]:string|number|null};
type Publication={academic_term_id:number;published_at:string;revision:number};
const FIELDS=['years_at_psu','academic_rank','govt_service_years','bachelors_degree','masters_degree','doctoral_degree','designation','consultation_schedule','research_details','extension_details','production_details','cocurricular_details','administrative_details','research_hours','extension_hours','production_hours','cocurricular_hours','administrative_hours'] as const;
const LABELS:Record<string,string>={
 years_at_psu:'Years at PSU',academic_rank:'Academic rank',govt_service_years:'Years in government service',
 bachelors_degree:'Bachelor’s degree',masters_degree:'Master’s degree',doctoral_degree:'Doctoral degree',designation:'Designation',
 consultation_schedule:'Consultation schedule',research_details:'Research activities',extension_details:'Extension activities',
 production_details:'Production activities',cocurricular_details:'Co-curricular assignments',administrative_details:'Administrative assignments',
 research_hours:'Research WHE',extension_hours:'Extension WHE',production_hours:'Production WHE',
 cocurricular_hours:'Co-curricular WHE',administrative_hours:'Administrative WHE'
};
const HOURS=new Set(['research_hours','extension_hours','production_hours','cocurricular_hours','administrative_hours']);
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
 const [masterReady,setMasterReady]=useState(false);
 const [templateBusy,setTemplateBusy]=useState(false);
 const [courseDraft,setCourseDraft]=useState<Record<string,string>>({});
 const [detailDraft,setDetailDraft]=useState<Record<string,string>>({});
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
   supabase.from('faculty_course_requests').select('faculty_id,course_offering_id,academic_term_id,status').eq('status','approved'),
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
 const fac=faculty.find(f=>f.id===selectedFaculty);
 const rows=useMemo(()=>{
  const cMap=new Map(courses.map(c=>[c.id,c])),oMap=new Map(offerings.map(o=>[o.id,o])),sMap=new Map(sections.map(s=>[s.id,s])),vMap=new Map(venues.map(v=>[v.id,v]));
  const approved=new Set(requests.filter(r=>r.faculty_id===selectedFaculty&&r.academic_term_id===term?.id&&r.status==='approved').map(r=>r.course_offering_id));
  const byOffering=new Map<number,Meeting[]>();
  for(const m of meetings)if(m.faculty_id===selectedFaculty&&m.academic_term_id===term?.id&&approved.has(m.course_offering_id)){
   byOffering.set(m.course_offering_id,[...(byOffering.get(m.course_offering_id)||[]),m]);
  }
  return Array.from(byOffering,([id,slots])=>{
   const o=oMap.get(id),c=cMap.get(o?.curriculum_course_id??-1),s=sMap.get(o?.class_section_id??''),w=classifications.find(x=>x.course_offering_id===id);
   const sorted=[...slots].sort((a,b)=>a.weekday-b.weekday),first=sorted[0];
   return {id,code:c?.course_code||'—',title:c?.course_title||'—',section:s?.block_label||'—',units:c?.units??null,room:vMap.get(first.venue_id)?.name||'—',
    days:sorted.map(x=>dayNames[x.weekday]).join(''),time:clock(first.start_minute)+'–'+clock(first.end_minute),
    weeklyMinutes:slots.reduce((n,x)=>n+x.end_minute-x.start_minute,0),w};
  }).sort((a,b)=>a.section.localeCompare(b.section)||a.code.localeCompare(b.code));
 },[courses,offerings,sections,venues,meetings,requests,classifications,selectedFaculty,term?.id]);
 const initialDetails=detailRows.find(d=>d.faculty_id===selectedFaculty&&d.academic_term_id===term?.id);
 const details:Record<string,string>={};for(const k of FIELDS)details[k]=detailDraft[k]??String(initialDetails?.[k]??'');
 const selectedRow=rows.find(r=>String(r.id)===courseDraft.id);
 function pickRow(id:number){
  const r=rows.find(x=>x.id===id);if(!r)return;
  setCourseDraft({id:String(id),category:r.w?.load_category||'regular',units_override:r.w?.units_override||'',
   whe:r.w?.whe===null||r.w?.whe===undefined?'':String(r.w.whe),
   lec:r.w?.lec_hours==null?'':String(r.w.lec_hours),lab:r.w?.lab_hours==null?'':String(r.w.lab_hours),
   rle:r.w?.rle_hours==null?'':String(r.w.rle_hours),male:r.w?.male_students==null?'':String(r.w.male_students),
   female:r.w?.female_students==null?'':String(r.w.female_students)});
  setReason('');
 }
 async function saveCourse(){
  if(!supabase||!selectedRow)return;
  setBusy(true);setMessage('');
  const {error}=await supabase.rpc('admin_save_workload_course',{
   p_offering_id:selectedRow.id,p_category:courseDraft.category,
   p_units_override:courseDraft.units_override||null,p_whe:numberOrNull(courseDraft.whe||''),
   p_lec:numberOrNull(courseDraft.lec||''),p_lab:numberOrNull(courseDraft.lab||''),p_rle:numberOrNull(courseDraft.rle||''),
   p_male:numberOrNull(courseDraft.male||''),p_female:numberOrNull(courseDraft.female||''),p_reason:reason.trim()
  });
  if(error)setMessage(error.message);else{setMessage('Workload classification and values saved.');setCourseDraft({});await load();}
  setBusy(false);
 }
 async function saveDetails(){
  if(!supabase)return;setBusy(true);setMessage('');
  const {error}=await supabase.rpc('admin_save_workload_details',{p_faculty_id:selectedFaculty,p_details:details});
  if(error)setMessage(error.message);else{setMessage('Academic profile and supplementary workload information saved.');setDetailDraft({});await load();}
  setBusy(false);
 }
 async function download(){
  if(!fac||!term||!template){setMessage('Select the official PSU-ACA-031 .docx template first.');return;}
  const unclassified=rows.filter(r=>!r.w);
  if(unclassified.length){setMessage('Classify each approved course before exporting. Missing: '+unclassified.map(r=>r.code+' '+r.section).join(', '));return;}
  setBusy(true);setMessage('');
  try{
   const entries:ExportCourse[]=rows.map(r=>({
    code:r.code,title:r.title,section:r.section,units:r.w?.units_override||String(r.units??''),room:r.room,time:r.time,days:r.days,
    whe:r.w?.whe??null,lec:r.w?.lec_hours??null,lab:r.w?.lab_hours??null,rle:r.w?.rle_hours??null,
    male:r.w?.male_students??null,female:r.w?.female_students??null,category:r.w!.load_category
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
   <h3>Approved teaching courses</h3>
   <div className="curriculum-table-wrap"><table className="curriculum-table"><thead><tr><th>Course and block</th><th>Time / room</th><th>Units</th><th>Weekly meeting hrs.</th><th>Load</th>{isAdmin&&<th>Manage</th>}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><strong>{r.code} · {r.section}</strong><p>{r.title}</p></td><td>{r.days} · {r.time}<p>{r.room}</p></td><td>{r.units??'—'}</td><td>{(r.weeklyMinutes/60).toFixed(1)}</td><td>{r.w?.load_category||'Needs classification'}{r.w?.whe!==null&&r.w?.whe!==undefined?` · WHE ${r.w.whe}`:''}</td>{isAdmin&&<td><button type="button" className="ghost" onClick={()=>pickRow(r.id)}>Edit</button></td>}</tr>)}</tbody></table></div>
   {rows.length===0&&<p>No approved, scheduled courses found for this faculty member. Approve courses and their room schedules first.</p>}
   {isAdmin&&selectedRow&&<div className="workload-edit"><h3>Review: {selectedRow.code} · {selectedRow.section}</h3><p className="curriculum-note">WHE and contact-hour equivalencies must follow authorized university rules. They are not inferred from the course units.</p>
    <div className="workload-fields">
     <label>Workload classification<select value={courseDraft.category} onChange={e=>setCourse('category',e.target.value)}><option value="regular">Regular teaching load</option><option value="extra">Extra teaching load</option></select></label>
     {([{k:'units_override',l:'Approved units notation (optional)'},{k:'whe',l:'Approved WHE'},{k:'lec',l:'Lecture contact hours'},{k:'lab',l:'Lab contact hours'},{k:'rle',l:'RLE hours'},{k:'male',l:'Male students'},{k:'female',l:'Female students'}] as const).map(x=><label key={x.k}>{x.l}<input type={x.k==='units_override'?'text':'number'} min={x.k==='units_override'?undefined:0} step={x.k==='male'||x.k==='female'?1:'0.5'} value={courseDraft[x.k]||''} onChange={e=>setCourse(x.k,e.target.value)}/></label>)}
    </div>
    <label>Administrator justification<input minLength={10} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Verified teaching load against approved PSU faculty workload guidance"/></label>
    <div className="availability-dialog-actions"><button className="primary" disabled={busy||reason.trim().length<10} onClick={()=>void saveCourse()}>Save workload entry</button><button className="ghost" onClick={()=>setCourseDraft({})}>Cancel</button></div>
   </div>}
   {isAdmin&&<div className="workload-edit"><h3>Faculty academic profile and supplementary workload</h3><div className="workload-fields">{FIELDS.map(k=><label key={k}>{LABELS[k]}{HOURS.has(k)?<input type="number" min="0" step=".5" value={details[k]} onChange={e=>setDetailDraft(prev=>({...prev,[k]:e.target.value}))}/>:<input value={details[k]} onChange={e=>setDetailDraft(prev=>({...prev,[k]:e.target.value}))}/>}</label>)}</div><button className="primary" disabled={busy} onClick={()=>void saveDetails()}>Save workload profile</button></div>}
   <div className="workload-download"><h3>Export to Microsoft Word (.docx)</h3><p>Upload the original PSU Faculty Workload <strong>PSU-ACA-031</strong> Word template. The export retains its tables and signatures while replacing historical faculty details and course entries with approved AIS data. A draft is visibly labeled if the timetable is not published.</p>
    <label>Official PSU-ACA-031 template (.docx)<input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e:ChangeEvent<HTMLInputElement>)=>setTemplate(e.target.files?.[0]||null)}/></label>
    <button className="primary" disabled={busy||!template||!fac||rows.length===0} onClick={()=>void download()}>Export editable PSU Workload</button>
    <p className="curriculum-note">Unverified student counts, WHE, research, extension and other workload values remain blank. Review every exported entry before collecting approvals.</p>
   </div>
  </>}
  {message&&<div className="notice" role="status">{message}</div>}
 </section>;
}
