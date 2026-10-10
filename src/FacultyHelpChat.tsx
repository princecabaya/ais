import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { supabase } from './supabase';
type Thread={id:number;faculty_id:string;updated_at:string};
type Message={id:number;thread_id:number;sender_id:string;body:string;created_at:string};
type Faculty={id:string;first_name:string;last_name:string;department:string};
export function FacultyHelpChat({facultyId,isAdmin}:{facultyId:string;isAdmin:boolean}){
 const [open,setOpen]=useState(false);
 const [threads,setThreads]=useState<Thread[]>([]);
 const [people,setPeople]=useState<Faculty[]>([]);
 const [selected,setSelected]=useState<number|null>(null);
 const [messages,setMessages]=useState<Message[]>([]);
 const [draft,setDraft]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const endRef=useRef<HTMLDivElement>(null);
 const load=useCallback(async()=>{
  if(!supabase)return;
  const [t,p]=await Promise.all([
   supabase.from('faculty_help_threads').select('id,faculty_id,updated_at').order('updated_at',{ascending:false}),
   isAdmin?supabase.from('profiles').select('id,first_name,last_name,department').eq('status','active'):Promise.resolve({data:[] as Faculty[],error:null})
  ]);
  if(t.error){setError(t.error.message);return}
  setThreads(t.data as Thread[]||[]);
  setPeople(p.data as Faculty[]||[]);
  if(!isAdmin&&t.data?.length)setSelected((cur)=>cur??(t.data as Thread[])[0].id);
 },[isAdmin]);
 useEffect(()=>{if(open)void load()},[open,load]);
 useEffect(()=>{
  if(!open||!supabase)return;
  let alive=true;
  const refresh=async()=>{
   if(selected===null){setMessages([]);return}
   const {data,error:e}=await supabase!.from('faculty_help_messages')
    .select('id,thread_id,sender_id,body,created_at').eq('thread_id',selected).order('created_at',{ascending:true}).limit(150);
   if(alive){if(e)setError(e.message);else setMessages(data as Message[]||[])}
  };
  void refresh();
  const timer=window.setInterval(()=>{void refresh();void load()},12000);
  return()=>{alive=false;window.clearInterval(timer)};
 },[open,selected,load]);
 useEffect(()=>{endRef.current?.scrollIntoView({block:'end'})},[messages.length,selected]);
 async function send(e:FormEvent){
  e.preventDefault();if(!supabase||!draft.trim()||busy)return;
  setBusy(true);setError('');
  const {error:e2}=await supabase.rpc('send_faculty_help_message',{p_thread_id:selected,p_body:draft.trim()});
  if(e2)setError(e2.message);
  else{
   setDraft('');
   const {data}=await supabase.from('faculty_help_threads').select('id,faculty_id,updated_at').order('updated_at',{ascending:false});
   if(data){setThreads(data as Thread[]);if(!isAdmin&&selected===null&&data.length)setSelected((data as Thread[])[0].id)}
   if(selected!==null){
    const {data:msgs}=await supabase.from('faculty_help_messages').select('id,thread_id,sender_id,body,created_at').eq('thread_id',selected).order('created_at',{ascending:true}).limit(150);
    if(msgs)setMessages(msgs as Message[]);
   }
  }
  setBusy(false);
 }
 const sender=(id:string)=>id===facultyId?'You':isAdmin?people.find(p=>p.id===id)?.first_name||'Faculty':'Campus administrator';
 const displayName=(id:string)=>{const p=people.find(p=>p.id===id);return p?`${p.last_name}, ${p.first_name}`:'Faculty conversation'};
 return <div className="faculty-chat-widget">
  {open&&<section className="faculty-chat-window" aria-label="Faculty and administrator help chat">
   <header className="faculty-chat-head"><div><strong>{isAdmin?'Faculty Help Inbox':'Chat with Campus Admin'}</strong><small>{isAdmin?'Respond to faculty scheduling requests':'Send scheduling questions or requests'}</small></div><button type="button" aria-label="Close chat" onClick={()=>setOpen(false)}><X size={18}/></button></header>
   {isAdmin&&<div className="faculty-chat-inbox">
    {threads.map(t=><button type="button" className={selected===t.id?'chosen':''} key={t.id} onClick={()=>setSelected(t.id)}>{displayName(t.faculty_id)}</button>)}
    {!threads.length&&<small>No faculty messages yet.</small>}
   </div>}
   <div className="faculty-chat-history" role="log" aria-live="polite">
    {!messages.length&&<p className="faculty-chat-empty">{isAdmin?'Select a faculty conversation to read messages.':'Ask the campus administrator about a course, schedule, venue, or workload request.'}</p>}
    {messages.map(m=><div className={m.sender_id===facultyId?'chat-bubble own':'chat-bubble'} key={m.id}>
      <small>{sender(m.sender_id)} · {new Date(m.created_at).toLocaleString()}</small><p>{m.body}</p>
    </div>)}
    <div ref={endRef}/>
   </div>
   {error&&<p className="faculty-chat-error" role="alert">{error}</p>}
   {(!isAdmin||selected!==null)&&<form className="faculty-chat-form" onSubmit={e=>void send(e)}>
    <input aria-label="Type message to administrator" maxLength={2000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Type a message…" required/>
    <button type="submit" aria-label="Send message" disabled={busy||!draft.trim()}><Send size={18}/></button>
   </form>}
   <div className="faculty-chat-footer">Messages stay inside the PSU faculty portal. Refreshes about every 12 seconds.</div>
  </section>}
  <button type="button" className="faculty-chat-bubble" aria-expanded={open} onClick={()=>setOpen(x=>!x)} aria-label={open?'Close help chat':'Open faculty help chat'}>
   {open?<X size={23}/>:<MessageCircle size={23}/>}
   {!open&&<span>{isAdmin?'Admin help inbox':'Chat with Admin'}</span>}
  </button>
 </div>;
}
