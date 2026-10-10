import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

type Preference='available'|'preferred'|'unavailable';
type Availability={faculty_id:string;academic_term_id:number;weekday:number;slot_index:number;preference:Preference;note:string|null};
type Override={id:number;faculty_id:string;academic_term_id:number;weekday:number;slot_index:number;justification:string;created_at:string;revoked_at:string|null};
type Faculty={id:string;first_name:string;last_name:string;department:string};
type Term={id:number;academic_year:string;semester:number;is_active:boolean};
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const SLOTS=[
 {start:'07:30',end:'09:00',label:'7:30–9:00 AM'},
 {start:'09:00',end:'10:30',label:'9:00–10:30 AM'},
 {start:'10:30',end:'12:00',label:'10:30–12:00 PM'},
 {start:'13:00',end:'14:30',label:'1:00–2:30 PM'},
 {start:'14:30',end:'16:00',label:'2:30–4:00 PM'},
 {start:'16:00',end:'17:30',label:'4:00–5:30 PM'},
 {start:'17:30',end:'19:00',label:'5:30–7:00 PM'},
];
const labels:{[K in Preference]:string}={available:'Available',preferred:'Preferred',unavailable:'Unavailable'};
const key=(day:number,slot:number)=>day+':'+slot;

export function FacultyAvailability({facultyId,isAdmin}:{facultyId:string;isAdmin:boolean}){
 const [terms,setTerms]=useState<Term[]>([]);
 const [all,setAll]=useState<Availability[]>([]);
 const [overrides,setOverrides]=useState<Override[]>([]);
 const [faculty,setFaculty]=useState<Faculty[]>([]);
 const [viewFaculty,setViewFaculty]=useState(facultyId);
 const [note,setNote]=useState('');
 const [editing,setEditing]=useState<{day:number;slot:number}|null>(null);
 const [overrideTarget,setOverrideTarget]=useState<{day:number;slot:number}|null>(null);
 const [justification,setJustification]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [message,setMessage]=useState('');
 const term=terms.find(t=>t.is_active);
 const own=viewFaculty===facultyId;
 const load=useCallback(async()=>{
  if(!supabase)return;
  setLoading(true);
  const results=await Promise.all([
   supabase.from('academic_terms').select('id,academic_year,semester,is_active'),
   supabase.from('faculty_availability').select('faculty_id,academic_term_id,weekday,slot_index,preference,note'),
   supabase.from('availability_overrides').select('id,faculty_id,academic_term_id,weekday,slot_index,justification,created_at,revoked_at'),
   isAdmin?supabase.from('profiles').select('id,first_name,last_name,department').eq('status','active').order('last_name'):Promise.resolve({data:[],error:null})
  ]);
  const problem=results.find(r=>r.error)?.error;
  if(problem)setMessage(problem.message);
  else{
   setTerms(results[0].data as Term[]||[]);
   setAll(results[1].data as Availability[]||[]);
   setOverrides(results[2].data as Override[]||[]);
   setFaculty(results[3].data as Faculty[]||[]);
  }
  setLoading(false);
 },[isAdmin]);
 useEffect(()=>{void load()},[load]);
 const prefs=useMemo(()=>new Map(all.filter(a=>a.faculty_id===viewFaculty&&a.academic_term_id===term?.id).map(a=>[key(a.weekday,a.slot_index),a])),[all,term?.id,viewFaculty]);
 const activeOverrides=useMemo(()=>new Map(overrides.filter(o=>o.faculty_id===viewFaculty&&o.academic_term_id===term?.id&&!o.revoked_at).map(o=>[key(o.weekday,o.slot_index),o])),[overrides,term?.id,viewFaculty]);
 const counts=useMemo(()=>({preferred:[...prefs.values()].filter(p=>p.preference==='preferred').length,unavailable:[...prefs.values()].filter(p=>p.preference==='unavailable').length,exceptions:activeOverrides.size}),[prefs,activeOverrides]);
 async function change(day:number,slot:number,value:Preference){
  if(!own||!supabase)return;
  setBusy(true);setMessage('');
  const {error}=await supabase.rpc('set_faculty_availability',{p_weekday:day,p_slot_index:slot,p_preference:value,p_note:null});
  if(error)setMessage(error.message);
  else await load();
  setBusy(false);
 }
 async function authorize(){
  if(!supabase||!overrideTarget)return;
  setBusy(true);setMessage('');
  const {error}=await supabase.rpc('set_availability_override',{p_faculty_id:viewFaculty,p_weekday:overrideTarget.day,p_slot_index:overrideTarget.slot,p_justification:justification.trim()});
  if(error)setMessage(error.message);
  else{setMessage('Administrative exception recorded. The faculty preference remains unchanged.');setOverrideTarget(null);setJustification('');await load();}
  setBusy(false);
 }
 async function revoke(id:number){
  if(!supabase||!window.confirm('Revoke this administrative availability exception?'))return;
  setBusy(true);setMessage('');
  const {error}=await supabase.rpc('revoke_availability_override',{p_override_id:id});
  if(error)setMessage(error.message);
  else{setMessage('Exception revoked.');await load();}
  setBusy(false);
 }
 const cell=(day:number,slot:number)=>{
  const preference=prefs.get(key(day,slot))?.preference||'available';
  const exception=activeOverrides.get(key(day,slot));
  return <div className="availability-cell" key={key(day,slot)}>
   <button type="button" title={own?'Change your availability':labels[preference]} disabled={!own||busy}
    className={'availability-choice status-'+preference+(exception?' overridden':'')}
    onClick={()=>{setEditing({day,slot});setNote(prefs.get(key(day,slot))?.note||'')}}>
    <span>{labels[preference]}</span>
    {exception&&<small>Override recorded</small>}
   </button>
   {!own&&isAdmin&&preference==='unavailable'&&(!exception?
     <button type="button" className="availability-exception-link" onClick={()=>{setOverrideTarget({day,slot});setJustification('')}}>Authorize exception</button>
     :<button type="button" disabled={busy} className="availability-exception-link" onClick={()=>void revoke(exception.id)}>Revoke override</button>)}
  </div>;
 };
 return <section id="faculty-availability" className="panel faculty-availability">
  <div className="availability-top"><div><span className="kicker">PHASE 2 · TEACHING AVAILABILITY</span><h2>Faculty Availability</h2><p>Mark periods you prefer or cannot teach. Unmarked periods are treated as available, not preferred.</p></div><button type="button" className="ghost" onClick={()=>void load()}>Refresh</button></div>
  <div className="availability-intro">
   <div><strong>{counts.preferred}</strong><span>Preferred periods</span></div>
   <div><strong>{counts.unavailable}</strong><span>Unavailable periods</span></div>
   <div><strong>{counts.exceptions}</strong><span>Approved exceptions</span></div>
  </div>
  {isAdmin&&<label className="availability-faculty-picker">Review instructor
   <select value={viewFaculty} onChange={e=>{setViewFaculty(e.target.value);setEditing(null);setOverrideTarget(null)}}>
    {faculty.map(f=><option key={f.id} value={f.id}>{f.last_name}, {f.first_name} · {f.department}{f.id===facultyId?' (you)':''}</option>)}
   </select>
  </label>}
  <p className="curriculum-note">{term?term.academic_year+' · Semester '+term.semester:'No active academic term'} · {own?'Editing your availability':'Administrator read-only view of faculty preferences'}.</p>
  <div className="availability-legend">
   <span className="legend-available">Available</span><span className="legend-preferred">Preferred</span><span className="legend-unavailable">Unavailable</span>
  </div>
  {loading?<p>Loading weekly availability…</p>:<div className="availability-table-wrap"><table className="availability-matrix"><thead><tr><th>Time</th>{DAYS.map(d=><th key={d}>{d}</th>)}</tr></thead><tbody>{SLOTS.map((s,i)=><tr key={s.start}><th scope="row">{s.label}</th>{DAYS.map((_,j)=><td key={j}>{cell(j+1,i+1)}</td>)}</tr>)}</tbody></table></div>}
  <p className="curriculum-note">Monday/Wednesday and Tuesday/Thursday teaching assignments must use matching meeting times. PATHFit may be scheduled any weekday as one continuous two-hour session; NSTP is a continuous three-hour Friday session. Availability choices do not create teaching assignments or reserve rooms. Special-class times will be validated during scheduling.</p>
  {editing&&own&&<div className="availability-dialog">
   <h3>{DAYS[editing.day-1]} · {SLOTS[editing.slot-1].label}</h3>
   <p>Choose how this period should be considered when building your teaching timetable.</p>
   <div className="availability-dialog-actions">
    {(['available','preferred','unavailable'] as Preference[]).map(p=><button type="button" className={'availability-action status-'+p} disabled={busy} key={p} onClick={()=>{void change(editing.day,editing.slot,p);setEditing(null)}}>{labels[p]}</button>)}
   </div>
   <button type="button" className="link" onClick={()=>setEditing(null)}>Cancel</button>
  </div>}
  {overrideTarget&&isAdmin&&!own&&<div className="availability-dialog">
   <h3>Administrator availability exception</h3>
   <p>{DAYS[overrideTarget.day-1]} · {SLOTS[overrideTarget.slot-1].label}. An exception is an authorized override to an instructor's unavailable period, not a class schedule. Provide a documented justification.</p>
   <label>Required justification<textarea rows={3} minLength={10} maxLength={1000} value={justification} onChange={e=>setJustification(e.target.value)} placeholder="Campus staffing need, faculty consultation, and reason for exception"/></label>
   <div className="availability-dialog-actions"><button className="primary" type="button" disabled={busy||justification.trim().length<10} onClick={()=>void authorize()}>Record exception</button><button className="ghost" type="button" onClick={()=>setOverrideTarget(null)}>Cancel</button></div>
  </div>}
  {message&&<div className="notice" role="status">{message}</div>}
 </section>;
}
