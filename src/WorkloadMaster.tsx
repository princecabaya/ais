import { useEffect, useState, type ChangeEvent } from 'react';
import { supabase } from './supabase';

export function WorkloadMaster({isAdmin,onReady}:{isAdmin:boolean;onReady:(file:File|null)=>void}){
 const [available,setAvailable]=useState(false);
 const [chosen,setChosen]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 async function fetchMaster(){
  if(!supabase)return;
  const {data,error}=await supabase.storage.from('faculty-workload-templates').download('PSU-ACA-031-master.docx');
  if(!error&&data){const file=new File([data],'PSU-ACA-031-master.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});onReady(file);setAvailable(true)}
  else{setAvailable(false);onReady(null)}
 }
 useEffect(()=>{void fetchMaster()},[]);
 async function save(){
  if(!supabase||!chosen)return;
  setBusy(true);setMessage('');
  const {error}=await supabase.storage.from('faculty-workload-templates').upload('PSU-ACA-031-master.docx',chosen,{contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',upsert:true});
  if(error)setMessage(error.message);
  else{setMessage('Campus workload master template saved.');await fetchMaster()}
  setBusy(false);
 }
 async function download(){
  if(!supabase)return;
  const {data,error}=await supabase.storage.from('faculty-workload-templates').download('PSU-ACA-031-master.docx');
  if(error){setMessage(error.message);return}
  if(data){const url=URL.createObjectURL(data);const a=document.createElement('a');a.href=url;a.download='PSU-ACA-031_Blank_Master.docx';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
 }
 return <div className="workload-master-manager">
  <p className="curriculum-note"><strong>University master:</strong> {available?'Available in private campus storage':'Not yet saved to campus storage'}</p>
  {available&&<button type="button" className="ghost" onClick={()=>void download()}>Download blank master</button>}
  {isAdmin&&<div className="workload-master-controls"><label>Administrator: upload clean PSU-ACA-031 master file<input type="file" accept=".docx" onChange={(e:ChangeEvent<HTMLInputElement>)=>setChosen(e.target.files?.[0]||null)}/></label><button type="button" className="ghost" disabled={busy||!chosen} onClick={()=>void save()}>{busy?'Saving…':'Save campus master'}</button></div>}
  {message&&<p className="notice">{message}</p>}
 </div>
}
