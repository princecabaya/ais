import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {supabase} from './supabase';

type Faculty={id:string;email:string;username:string;first_name:string;last_name:string;middle_initial:string|null;department:string;employment_type:string;role:string;status:string;contact_number:string|null;office_location:string|null};
const EMPTY={username:'',first_name:'',last_name:'',middle_initial:'',department:'BEEd',employment_type:'cos',contact_number:'',office_location:''};
export function FacultyAccountManagement(){
 const [users,setUsers]=useState<Faculty[]>([]);
 const [selected,setSelected]=useState<string>('');
 const [draft,setDraft]=useState(EMPTY);
 const [reason,setReason]=useState('');
 const [search,setSearch]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [loading,setLoading]=useState(true);
 const [mailStatus,setMailStatus]=useState('');
 const [mailCounts,setMailCounts]=useState({pending:0,sending:0,sent:0,failed:0});
 const load=useCallback(async()=>{
  if(!supabase)return;setLoading(true);
  const {data,error}=await supabase.from('profiles')
   .select('id,email,username,first_name,last_name,middle_initial,department,employment_type,role,status,contact_number,office_location')
   .order('last_name');
  if(error)setMessage(error.message);else setUsers((data||[]) as Faculty[]);
  setLoading(false);
 },[]);
 useEffect(()=>{void load()},[load]);
 const current=users.find(x=>x.id===selected);
 const select=(u:Faculty)=>{
  setSelected(u.id);setMessage('');setReason('');
  setDraft({username:u.username,first_name:u.first_name,last_name:u.last_name,middle_initial:u.middle_initial||'',department:u.department,employment_type:u.employment_type,contact_number:u.contact_number||'',office_location:u.office_location||''});
 };
 const edit=(key:keyof typeof EMPTY,value:string)=>setDraft(x=>({...x,[key]:value}));
 async function save(e:FormEvent){
  e.preventDefault();if(!supabase||!current||busy)return;
  setBusy(true);setMessage('');
  const {error}=await supabase.rpc('admin_update_faculty',{
   p_faculty_id:current.id,p_username:draft.username,p_first_name:draft.first_name,
   p_last_name:draft.last_name,p_middle_initial:draft.middle_initial,
   p_department:draft.department,p_employment_type:draft.employment_type,
   p_contact_number:draft.contact_number,p_office_location:draft.office_location,p_reason:reason.trim()
  });
  if(error)setMessage(error.code==='23505'?'Username is already taken.':error.message);
  else {setMessage('Faculty profile saved. A change notice has been recorded for the faculty member.');setReason('');await load()}
  setBusy(false);
 }
 async function setActive(active:boolean){
  if(!supabase||!current||busy)return;
  if(!window.confirm(active?'Restore this faculty member’s access?':'Deactivate this faculty account? Historical requests and classes will be preserved.'))return;
  setBusy(true);setMessage('');
  const {error}=await supabase.rpc('admin_set_faculty_active',{p_faculty_id:current.id,p_active:active,p_reason:reason.trim()});
  if(error)setMessage(error.message);
  else{setMessage(active?'Faculty account reactivated.':'Faculty account deactivated. Existing teaching records were retained.');setReason('');await load()}
  setBusy(false);
 }
 async function refreshMailCounts(){
  if(!supabase)return;
  const {data,error}=await supabase.from('faculty_change_notifications').select('email_status').limit(1000);
  if(error)setMailStatus(error.message);
  else {
   const totals={pending:0,sending:0,sent:0,failed:0};
   (data||[]).forEach(item=>{
    const key=item.email_status as keyof typeof totals;
    if(key in totals)totals[key]++;
   });
   setMailCounts(totals);
   setMailStatus('Queue status refreshed.');
  }
 }
 useEffect(()=>{void refreshMailCounts()},[]);
 const matches=users.filter(u=>[u.email,u.username,u.first_name,u.last_name,u.department].some(v=>v.toLowerCase().includes(search.toLowerCase())));
 return <section className="panel faculty-account-admin">
  <div className="selection-top"><div><span className="kicker">ADMINISTRATOR · FACULTY ACCESS</span>
   <h2>Faculty Account Management</h2><p>View and edit authorized faculty profiles, or deactivate access without deleting university records.</p></div>
   <button className="ghost" type="button" onClick={()=>void load()}>Refresh accounts</button>
  </div>
  <div className="account-admin-mail">
   <div><strong>Faculty change notifications · Gmail</strong><p>Portal notices are saved automatically. The dedicated Gmail script delivers pending emails approximately every five minutes once configured.</p></div>
   <button type="button" className="ghost" onClick={()=>void refreshMailCounts()}>Refresh email queue</button>
   <p>Pending: {mailCounts.pending} · Sending: {mailCounts.sending} · Sent: {mailCounts.sent} · Failed: {mailCounts.failed}</p>
   {mailStatus&&<p role="status">{mailStatus}</p>}
  </div>
  <div className="account-admin-layout">
   <aside className="account-admin-list">
    <label>Search faculty<input type="search" placeholder="Name, username or PSU email" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <div className="account-admin-entries">{matches.map(u=><button type="button" key={u.id} className={selected===u.id?'selected':''} onClick={()=>select(u)}>
     <strong>{u.last_name}, {u.first_name}</strong><small>{u.email}</small>
     <span>{u.department} · {u.role} · {u.status}</span>
    </button>)}</div>
    {loading&&<p>Loading faculty accounts…</p>}
   </aside>
   <div className="account-admin-editor">{current?<form onSubmit={e=>void save(e)}>
    <h3>Account details · {current.last_name}, {current.first_name}</h3>
    <p className="curriculum-note">Administrator access permits reviewing and updating faculty details, not accessing passwords or impersonating their login.</p>
    <div className="account-admin-grid">
     <label>Verified PSU email<input disabled value={current.email}/></label>
     <label>Username<input required minLength={3} maxLength={30} value={draft.username} onChange={e=>edit('username',e.target.value)}/></label>
     <label>Last name<input required value={draft.last_name} onChange={e=>edit('last_name',e.target.value)}/></label>
     <label>First name<input required value={draft.first_name} onChange={e=>edit('first_name',e.target.value)}/></label>
     <label>Middle initial<input maxLength={2} value={draft.middle_initial} onChange={e=>edit('middle_initial',e.target.value)}/></label>
     <label>Department<select value={draft.department} onChange={e=>edit('department',e.target.value)}><option>BEEd</option><option>BSE</option><option>BSA</option><option>Administration</option></select></label>
     <label>Appointment<select value={draft.employment_type} onChange={e=>edit('employment_type',e.target.value)}><option value="regular">Regular</option><option value="tempo">Tempo</option><option value="cos">COS</option><option value="part_time">Part-Time</option></select></label>
     <label>Contact number<input value={draft.contact_number} onChange={e=>edit('contact_number',e.target.value)}/></label>
     <label>Office location<input value={draft.office_location} onChange={e=>edit('office_location',e.target.value)}/></label>
     <label>Role and status<input disabled value={current.role+' · '+current.status}/></label>
    </div>
    <label>Administrator reason (required for editing or deactivation)<textarea rows={2} minLength={8} required value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain the correction or personnel change"/></label>
    <div className="account-admin-actions">
     <button className="primary" disabled={busy||reason.trim().length<8} type="submit">Save faculty changes</button>
     {current.role!=='admin'&&<button className="ghost" disabled={busy||reason.trim().length<8} type="button" onClick={()=>void setActive(current.status!=='active')}>
      {current.status==='active'?'Deactivate faculty account':'Reactivate faculty account'}
     </button>}
    </div>
    <p className="curriculum-note">Deactivation preserves teaching history and prevents dashboard access. Administrator accounts cannot be deactivated here. For stronger session revocation, server-side sign-out support can be added separately.</p>
   </form>:<p>Select a faculty account on the left to view or edit its registered information.</p>}</div>
  </div>
  {message&&<div className="notice" role="status">{message}</div>}
 </section>;
}
