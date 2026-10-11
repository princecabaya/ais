import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { UserRound, LockKeyhole, Save } from 'lucide-react';
import { supabase } from './supabase';

type Account={
 id:string;email:string;username:string;first_name:string;last_name:string;
 middle_initial:string|null;department:string;employment_type:string;
 role:string;status:string;contact_number:string|null;office_location:string|null;
};
export function MyAccount({facultyId,onAccountSaved}:{
 facultyId:string;onAccountSaved:()=>Promise<void>;
}){
 const [account,setAccount]=useState<Account|null>(null);
 const [form,setForm]=useState({username:'',first_name:'',last_name:'',middle_initial:'',contact_number:'',office_location:''});
 const [oldPassword,setOldPassword]=useState('');
 const [newPassword,setNewPassword]=useState('');
 const [confirmPassword,setConfirmPassword]=useState('');
 const [saving,setSaving]=useState(false);
 const [changingPassword,setChangingPassword]=useState(false);
 const [loading,setLoading]=useState(true);
 const [notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  if(!supabase)return;
  setLoading(true);
  const {data,error}=await supabase.from('profiles').select('id,email,username,first_name,last_name,middle_initial,department,employment_type,role,status,contact_number,office_location').eq('id',facultyId).single();
  if(error)setNotice(error.message);
  else{
   const a=data as Account;setAccount(a);
   setForm({
    username:a.username||'',first_name:a.first_name||'',last_name:a.last_name||'',
    middle_initial:a.middle_initial||'',contact_number:a.contact_number||'',office_location:a.office_location||''
   });
  }
  setLoading(false);
 },[facultyId]);
 useEffect(()=>{void load()},[load]);
 const edit=(key:keyof typeof form,value:string)=>setForm(v=>({...v,[key]:value}));
 async function save(e:FormEvent){
  e.preventDefault();if(!supabase)return;
  setSaving(true);setNotice('');
  const {error}=await supabase.rpc('update_my_faculty_account',{
   p_username:form.username,
   p_first_name:form.first_name,
   p_last_name:form.last_name,
   p_middle_initial:form.middle_initial,
   p_contact_number:form.contact_number,
   p_office_location:form.office_location
  });
  if(error)setNotice(error.code==='23505'?'This username is already registered. Try another.':error.message);
  else{
   await load();await onAccountSaved();
   setNotice('Your account information was saved successfully.');
  }
  setSaving(false);
 }
 async function changePassword(e:FormEvent){
  e.preventDefault();if(!supabase||!account)return;
  if(newPassword.length<12){setNotice('Your new password must contain at least 12 characters.');return}
  if(newPassword!==confirmPassword){setNotice('The new passwords do not match.');return}
  setChangingPassword(true);setNotice('');
  // Reauthenticate using the current password before changing the login credential.
  const {error:loginError}=await supabase.auth.signInWithPassword({email:account.email,password:oldPassword});
  if(loginError){setNotice('The current password is incorrect or cannot be verified.');setChangingPassword(false);return}
  const {error}=await supabase.auth.updateUser({password:newPassword});
  if(error)setNotice(error.message);
  else{
   setOldPassword('');setNewPassword('');setConfirmPassword('');
   setNotice('Your password has been changed.');
  }
  setChangingPassword(false);
 }
 const appointment:Record<string,string>={
  regular:'Regular · Plantilla',tempo:'Tempo · Conditional plantilla',
  cos:'COS · Contract of Service',part_time:'Part-time'
 };
 return <section className="panel my-account" id="my-account">
  <div className="selection-top"><div><span className="kicker">FACULTY ACCOUNT · PERSONAL SETTINGS</span>
   <h2><UserRound size={24}/> My Account</h2>
   <p>Review, edit and save your registered faculty information. Changes to your name and username appear in the scheduling system.</p></div>
   <button type="button" className="ghost" onClick={()=>void load()} disabled={saving||loading}>Reload profile</button>
  </div>
  {loading?<p>Loading your account…</p>:!account?<p className="notice">{notice||'Faculty record unavailable.'}</p>:<>
   <div className="account-overview">
    <div><small>University email · verified account</small><strong>{account.email}</strong></div>
    <div><small>Department</small><strong>{account.department}</strong></div>
    <div><small>Appointment</small><strong>{appointment[account.employment_type]||account.employment_type}</strong></div>
    <div><small>Account role / status</small><strong>{account.role==='admin'?'Administrator':'Faculty'} · {account.status}</strong></div>
   </div>
   <p className="curriculum-note">Your university email, department, appointment classification, and administrator role are protected fields. Contact the campus administrator through the help chat if any of these need correction.</p>
   <form className="account-edit-form" onSubmit={e=>void save(e)}>
    <h3>Personal information</h3>
    <div className="account-edit-grid">
     <label>Username<input type="text" required minLength={3} maxLength={30} autoComplete="username" value={form.username} onChange={e=>edit('username',e.target.value)}/><small>3–30 letters, numbers, dots, underscores or hyphens</small></label>
     <label>Contact number (optional)<input type="tel" maxLength={30} value={form.contact_number} onChange={e=>edit('contact_number',e.target.value)} placeholder="09XX XXX XXXX"/></label>
     <label>Last name<input required maxLength={100} value={form.last_name} onChange={e=>edit('last_name',e.target.value)}/></label>
     <label>First name<input required maxLength={100} value={form.first_name} onChange={e=>edit('first_name',e.target.value)}/></label>
     <label>Middle initial<input maxLength={2} value={form.middle_initial} onChange={e=>edit('middle_initial',e.target.value)} placeholder="N."/></label>
     <label>Office / consultation location (optional)<input maxLength={150} value={form.office_location} onChange={e=>edit('office_location',e.target.value)} placeholder="Faculty office or campus location"/></label>
    </div>
    <div className="account-edit-actions"><button type="submit" className="primary" disabled={saving}><Save size={16}/>{saving?'Saving…':'Save account information'}</button></div>
   </form>
   <form className="account-password-form" onSubmit={e=>void changePassword(e)}>
    <h3><LockKeyhole size={19}/> Change password</h3>
    <p>Use your existing account password to confirm the change. The new password must have at least 12 characters.</p>
    <div className="account-edit-grid">
     <label>Current password<input type="password" required autoComplete="current-password" value={oldPassword} onChange={e=>setOldPassword(e.target.value)}/></label>
     <label>New password<input type="password" required minLength={12} autoComplete="new-password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label>
     <label>Confirm new password<input type="password" required minLength={12} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>
    </div>
    <button type="submit" className="ghost" disabled={changingPassword}>{changingPassword?'Updating password…':'Update password'}</button>
   </form>
   {notice&&<p className="notice" role="status">{notice}</p>}
  </>}
 </section>;
}
