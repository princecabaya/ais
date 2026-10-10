import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from './supabase';

type Venue={id:number;name:string;venue_type:string};
type Availability={weekday:number;slot_index:number;preference:string};
export type ScheduleChoice={pattern:'MW'|'TTH'|'PATHFIT'|'NSTP'|'FIELD';start:number;day:number|null;venueId:number|null};
type Props={
 code:string;title:string;block:string;units:number|null;rank:number;motivation:string;
 busy:boolean;submissionError:string;onClose:()=>void;onSubmit:(choice:ScheduleChoice,rank:number,motivation:string)=>Promise<void>
};
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const STARTS=[450,540,630,780,870,960,1050];
const clock=(n:number)=>{const h=Math.floor(n/60);return `${((h+11)%12)+1}:${String(n%60).padStart(2,'0')} ${h>=12?'PM':'AM'}`};
const meetingDays=(p:string,day:number)=>p==='MW'?[1,3]:p==='TTH'?[2,4]:p==='NSTP'?[5]:[day];
export function CourseScheduleWizard({code,title,block,units,rank:initialRank,motivation:initialMotivation,busy,submissionError,onClose,onSubmit}:Props){
 const kind=useMemo(()=>{const normalized=code.toUpperCase().replace(/\s+/g,'');return normalized.startsWith('NSTP')?'NSTP':normalized.startsWith('PATHFIT')?'PATHFIT':units===3?'STANDARD':'SPECIAL'},[code,units,title]);
 const [step,setStep]=useState(1);
 const [pattern,setPattern]=useState<'MW'|'TTH'|'PATHFIT'|'NSTP'>(kind==='FIELD'?'FIELD':kind==='NSTP'?'NSTP':kind==='PATHFIT'?'PATHFIT':'MW');
 const [weekday,setWeekday]=useState(1);
 const [start,setStart]=useState(450);
 const [venueId,setVenueId]=useState(0);
 const [venues,setVenues]=useState<Venue[]>([]);
 const [availability,setAvailability]=useState<Availability[]>([]);
 const [rank,setRank]=useState(initialRank);
 const [motivation,setMotivation]=useState(initialMotivation);
 const [error,setError]=useState('');
 const duration=kind==='FIELD'?0:kind==='NSTP'?180:kind==='PATHFIT'?120:90;
 const dates=meetingDays(pattern,weekday);
 const options=STARTS.filter(s=>s+duration<=1140&&!(s<720&&s+duration>780));
 const selectedStart=options.includes(start)?start:(options[0]??450);
 const venue=venues.find(v=>v.id===venueId);
 const dayLabel=pattern==='FIELD'?'Field placement · no classroom timetable':pattern==='MW'?'Monday & Wednesday':pattern==='TTH'?'Tuesday & Thursday':pattern==='NSTP'?'Friday':DAYS[weekday-1];
 const avWarning=availability.filter(a=>dates.includes(a.weekday)&&a.preference==='unavailable'&&
  [450,540,630,780,870,960,1050][a.slot_index-1]<selectedStart+duration&&
  [540,630,720,870,960,1050,1140][a.slot_index-1]>selectedStart);
 useEffect(()=>{
  if(!supabase)return;let mounted=true;
  (async()=>{
   const [v,a]=await Promise.all([
    supabase!.from('schedule_venues').select('id,name,venue_type').eq('active',true).order('name'),
    supabase!.from('faculty_availability').select('weekday,slot_index,preference').eq('academic_term_id',(await supabase!.from('academic_terms').select('id').eq('is_active',true).single()).data?.id??-1)
   ]);
   if(!mounted)return;
   if(v.error||a.error)setError(v.error?.message||a.error?.message||'Could not load choices');
   else{setVenues((v.data||[]) as Venue[]);setAvailability((a.data||[]) as Availability[]);}
  })();
  return()=>{mounted=false};
 },[]);
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose()};
  document.addEventListener('keydown',onKey);
  return()=>document.removeEventListener('keydown',onKey);
 },[onClose,busy]);
 async function submit(e:FormEvent){
  e.preventDefault();if(kind!=='FIELD'&&!venueId)return;
  await onSubmit({pattern:kind==='FIELD'?'FIELD':pattern,start:kind==='FIELD'?450:selectedStart,day:kind==='PATHFIT'?weekday:null,venueId:kind==='FIELD'?null:venueId},rank,motivation.trim());
 }
 return <div className="course-wizard-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}>
  <div className="course-wizard" role="dialog" aria-modal="true" aria-label="Select course schedule and room">
   <div className="course-wizard-header"><div><span className="kicker">TEACHING PREFERENCE · STEP {step} OF 3</span><h2>{code} · {block}</h2><p>{title}</p></div><button className="course-wizard-x" type="button" aria-label="Close" onClick={onClose} disabled={busy}>×</button></div>
   <div className="course-wizard-steps"><span className={step===1?'current':''}>1. Schedule</span><span className={step===2?'current':''}>2. Room</span><span className={step===3?'current':''}>3. Confirm</span></div>
   {kind==='FIELD'&&<p className="wizard-info">Field Study / Internship: select this placement without reserving a classroom or inventing weekly contact hours. The school or placement venue can be recorded separately in the administrative notes.</p>}
   {kind==='SPECIAL'&&<p className="wizard-warning">This course has special contact-hour requirements. Ask an administrator to configure its scheduling rule before requesting it.</p>}
   {step===1&&<div className="wizard-page">
    <h3>{kind==='FIELD'?'Supervised field placement':'When would you prefer to teach?'}</h3>
    {kind==='STANDARD'?<div className="wizard-patterns"><button type="button" className={pattern==='MW'?'chosen':''} onClick={()=>setPattern('MW')}>Monday & Wednesday<small>Same 90-minute period on both days</small></button><button type="button" className={pattern==='TTH'?'chosen':''} onClick={()=>setPattern('TTH')}>Tuesday & Thursday<small>Same 90-minute period on both days</small></button></div>:<p className="wizard-info">{kind==='PATHFIT'?'PATHFit requires one uninterrupted 2-hour meeting on a weekday.':'NSTP requires one uninterrupted 3-hour Friday meeting.'}</p>}
    {kind==='PATHFIT'&&<label>Choose weekday<select value={weekday} onChange={e=>setWeekday(Number(e.target.value))}>{DAYS.map((d,i)=><option key={d} value={i+1}>{d}</option>)}</select></label>}
    {kind!=='FIELD'&&<><h4>Choose the starting time</h4><div className="wizard-time-grid">{options.map(s=><button type="button" className={selectedStart===s?'chosen':''} key={s} onClick={()=>setStart(s)}>{clock(s)}<small>to {clock(s+duration)}</small></button>)}</div></>}
    {avWarning.length>0&&<p className="wizard-warning">You previously marked part of this time Unavailable. Choose a different period or update your Faculty Availability before scheduling approval.</p>}
    <p className="wizard-info">This is a preference only. Approval and conflict checks take place before the timetable becomes official.</p>
   </div>}
   {step===2&&<div className="wizard-page">
    <h3>{kind==='FIELD'?'No classroom booking required':'Where would you prefer to teach?'}</h3>
    <p className="wizard-info">{dayLabel}{kind==='FIELD'?'':' · '+clock(selectedStart)+'–'+clock(selectedStart+duration)}</p>
    {error&&<p className="wizard-warning">{error}</p>}
    {kind!=='FIELD'&&<div className="wizard-room-grid">{venues.map(v=><button key={v.id} type="button" className={venueId===v.id?'chosen':''} onClick={()=>setVenueId(v.id)}><strong>{v.name}</strong><small>{v.venue_type}</small></button>)}</div>}
    <p className="wizard-info">{kind==='FIELD'?'This field placement does not book a campus room. Actual placement arrangements are coordinated separately.':'A room choice does not reserve that room. The administrator will check availability and may request a different venue.'}</p>
   </div>}
   {step===3&&<form id="course-wizard-submit" className="wizard-page" onSubmit={e=>void submit(e)}>
    <h3>Review and send your preference</h3>
    <div className="wizard-review"><div><span>Subject</span><strong>{code} — {title}</strong></div><div><span>Student block</span><strong>{block}</strong></div><div><span>Preferred schedule</span><strong>{dayLabel} · {clock(selectedStart)}–{clock(selectedStart+duration)}</strong></div><div><span>Preferred venue</span><strong>{kind==='FIELD'?'No room required':venue?.name||'No room selected'}</strong></div></div>
    <label>Preference rank<select value={rank} onChange={e=>setRank(Number(e.target.value))}>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1}{i===0?' — Highest priority':''}</option>)}</select></label>
    <label>Teaching qualifications or special considerations (optional)<textarea maxLength={1000} value={motivation} onChange={e=>setMotivation(e.target.value)} rows={3} placeholder="Relevant qualifications or teaching experience"/></label>
    <p className="wizard-info">Submitting requests the course, schedule, and venue. The administrator approves the course first, then reviews the proposed schedule and room.</p>
   </form>}
   {submissionError&&<p className="wizard-warning" role="alert">{submissionError}</p>}
   <div className="course-wizard-footer"><button type="button" className="ghost" onClick={()=>step===1?onClose():setStep(step-1)} disabled={busy}>{step===1?'Cancel':'Back'}</button>{step<3?<button type="button" className="primary" disabled={kind==='SPECIAL'||(step===2&&kind!=='FIELD'&&!venueId)} onClick={()=>setStep(step+1)}>Next: {step===1?'Select room':'Review request'}</button>:<button type="submit" form="course-wizard-submit" className="primary" disabled={busy||(kind!=='FIELD'&&!venueId)}>{busy?'Submitting…':'Submit course preference'}</button>}</div>
  </div>
 </div>;
}
