import {useCallback,useEffect,useState} from 'react';
import {supabase} from './supabase';
type Note={id:number;kind:string;title:string;message:string;created_at:string;read_at:string|null;email_status:string};
export function FacultyNotifications({facultyId}:{facultyId:string}){
 const [items,setItems]=useState<Note[]>([]),[err,setErr]=useState('');
 const [loading,setLoading]=useState(false);
 const load=useCallback(async()=>{
  if(!supabase)return;
  setLoading(true);
  const {data,error}=await supabase.from('faculty_change_notifications')
   .select('id,kind,title,message,created_at,read_at,email_status')
   .eq('faculty_id',facultyId).order('created_at',{ascending:false}).limit(100);
  if(error)setErr(error.message);else setItems((data||[]) as Note[]);
  setLoading(false);
 },[facultyId]);
 useEffect(()=>{void load()},[load]);
 async function mark(id:number){
  if(!supabase)return;
  const {error}=await supabase.rpc('mark_my_notification_read',{p_id:id});
  if(error)setErr(error.message);else await load();
 }
 return <section className="panel faculty-notifications">
  <div className="selection-top"><div><span className="kicker">MY NOTIFICATIONS</span><h2>Account and teaching updates</h2>
   <p>Review notices about course decisions, schedule changes and administrator account updates.</p></div>
   <button type="button" className="ghost" onClick={()=>void load()} disabled={loading}>Refresh notices</button>
  </div>
  <p className="curriculum-note">Notices appear here automatically. Email status depends on campus mail delivery configuration; a queued email is not a sent email.</p>
  <div className="notifications-list">{items.map(n=><article className={n.read_at?'notification-item':'notification-item unread'} key={n.id}>
   <div><strong>{n.title}</strong><small>{new Date(n.created_at).toLocaleString('en-PH')}</small></div>
   <p>{n.message}</p>
   <div className="notification-actions"><span>Email: {n.email_status}</span>{!n.read_at&&<button type="button" className="ghost" onClick={()=>void mark(n.id)}>Mark as read</button>}</div>
  </article>)}
  {!items.length&&<p>No account or schedule notifications have been recorded yet.</p>}</div>
  {err&&<p role="alert" className="notice">{err}</p>}
 </section>;
}
