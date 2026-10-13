import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

type AcademicTerm={id:number;academic_year:string;semester:number;is_active:boolean};
export function AcademicTermSettings(){
 const [terms,setTerms]=useState<AcademicTerm[]>([]);
 const [semester,setSemester]=useState(1);
 const [year,setYear]=useState('2026–2027');
 const firstYear=new Date().getFullYear();
 const academicYearOptions=Array.from({length:10},(_,i)=>{const y=firstYear+i;return `${y}–${y+1}`});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{
  if(!supabase)return;
  const {data,error:e}=await supabase.from('academic_terms').select('id,academic_year,semester,is_active').order('academic_year',{ascending:false});
  if(e)setError(e.message);
  else{const records=(data||[]) as AcademicTerm[];setTerms(records);const active=records.find(t=>t.is_active);if(active){setSemester(active.semester);setYear(active.academic_year)}}
 },[]);
 useEffect(()=>{void load()},[load]);
 const current=terms.find(t=>t.is_active);
 async function activate(){
  if(!supabase)return;
  if(current?.academic_year===year&&current.semester===semester){setError('This semester is already active.');return}
  if(!window.confirm(`Activate ${semester===1?'First':'Second'} Semester, AY ${year}? This changes the course selection and scheduling period for all faculty. Existing requests will remain attached to their original semester.`))return;
  setBusy(true);setError('');
  const {error:e}=await supabase.rpc('admin_activate_academic_term',{p_academic_year:year,p_semester:semester});
  if(e){setError(e.message);setBusy(false)}
  else window.location.reload();
 }
 return <section className="panel term-settings" id="term-settings">
   <div className="selection-top"><div><span className="kicker">ADMINISTRATOR · ACADEMIC CALENDAR</span><h2>Course Selection Semester</h2><p>Choose which semester's prospectus subjects appear to faculty across BEEd, BSE, and the 2026–2027 graduating BSA legacy cohort.</p></div></div>
   <p className="curriculum-note">Currently active: <strong>{current?`${current.academic_year} · ${current.semester===1?'First':'Second'} Semester`:'No active semester'}</strong>.</p>
   <div className="term-setting-fields">
    <label>Academic year<select value={year} onChange={e=>setYear(e.target.value)}>{academicYearOptions.map(y=><option value={y} key={y}>{y}</option>)}</select></label>
    <label>Semester<select value={semester} onChange={e=>setSemester(Number(e.target.value))}><option value={1}>First semester</option><option value={2}>Second semester</option></select></label>
    <button className="primary" type="button" disabled={busy} onClick={()=>void activate()}>{busy?'Activating…':'Activate selected semester'}</button>
   </div>
   <p className="curriculum-note">Only administrators can change the active semester. Select the current academic year or one of the next nine years. On first activation, the system creates that year's 11 block records using the existing curriculum mappings. Review the mappings before using a future year; older semester requests remain preserved.</p>
   {error&&<div className="notice" role="alert">{error}</div>}
  </section>
}
