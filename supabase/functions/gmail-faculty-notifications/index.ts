import {createClient} from 'npm:@supabase/supabase-js@2';

function result(body:unknown,status=200){
 return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
async function sameSecret(a:string,b:string){
 const encoder=new TextEncoder();
 const [aHash,bHash]=await Promise.all([
  crypto.subtle.digest('SHA-256',encoder.encode(a)),
  crypto.subtle.digest('SHA-256',encoder.encode(b))
 ]);
 const aa=new Uint8Array(aHash),bb=new Uint8Array(bHash);
 let diff=0;
 for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];
 return diff===0;
}
Deno.serve(async request=>{
 if(request.method!=='POST')return result({error:'Unsupported method'},405);
 const expected=Deno.env.get('AIS_GMAIL_MAILER_KEY')??'';
 const received=request.headers.get('x-ais-mailer-key')??'';
 if(expected.length<32||received.length<32||!(await sameSecret(expected,received)))return result({error:'Unauthorized'},401);
 try{
  const url=Deno.env.get('SUPABASE_URL')??'';
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
  if(!url||!service)return result({error:'Supabase service is not configured'},503);
  const db=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
  const data=await request.json() as Record<string,unknown>;
  if(data.action==='ping')return result({connected:true});
  if(data.action==='claim'){
   const {data:items,error}=await db.rpc('claim_gmail_faculty_notices',{p_limit:Math.min(15,Math.max(1,Number(data.limit)||15))});
   if(error)throw error;
   return result({items:items??[]});
  }
  if(data.action==='claim_activation'){
   const {data:items,error}=await db.rpc('claim_gmail_activation_emails',{p_limit:10});
   if(error)throw error;
   return result({items:items??[]});
  }
  if(data.action==='ack_activation'){
   if(!Number.isSafeInteger(data.id)||typeof data.token!=='string'||typeof data.sent!=='boolean')return result({error:'Invalid acknowledgement'},400);
   const {data:updated,error}=await db.rpc('ack_gmail_activation_email',{
    p_id:data.id,p_token:data.token,p_sent:data.sent,p_error:typeof data.error==='string'?data.error.slice(0,280):null
   });
   if(error)throw error;
   return result({acknowledged:updated===true});
  }
  if(data.action==='ack'){
   const id=data.id,token=data.token,sent=data.sent;
   if(!Number.isSafeInteger(id)||typeof token!=='string'|| !/^[a-f0-9-]{36}$/i.test(token)||typeof sent!=='boolean')
    return result({error:'Invalid acknowledgement'},400);
   const {data:updated,error}=await db.rpc('ack_gmail_faculty_notice',{
    p_id:id,p_token:token,p_sent:sent,
    p_error:typeof data.error==='string'?data.error.slice(0,280):null
   });
   if(error)throw error;
   return result({acknowledged:updated===true});
  }
  return result({error:'Invalid operation'},400);
 }catch(error){
  console.error('AIS mail queue dispatch error',error instanceof Error?error.message:'Unknown');
  return result({error:'Notification queue temporarily unavailable'},503);
 }
});
