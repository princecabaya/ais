import { useState } from 'react';
import {
  UserRound, Mail, BookOpen, CalendarDays, ClipboardList, ShieldCheck,
  Users, ChevronDown, Menu, Clock3, Presentation, CalendarRange,
  Settings2, PanelLeftClose
} from 'lucide-react';

const facultyItems=[
 {id:'account',label:'My Account',icon:UserRound},
 {id:'notices',label:'Notifications',icon:Mail},
 {id:'information',label:'General Information',icon:BookOpen},
 {id:'courses',label:'Select Courses',icon:BookOpen},
 {id:'preview',label:'Schedule Preview',icon:Presentation},
 {id:'availability',label:'Availability',icon:Clock3},
 {id:'scheduling',label:'Schedule & Rooms',icon:CalendarDays},
 {id:'workload',label:'Faculty Workload',icon:ClipboardList}
] as const;
const adminItems=[
 {id:'approval',label:'Approvals',icon:ShieldCheck},
 {id:'semester',label:'Semester',icon:CalendarRange},
 {id:'curriculum',label:'Curricula',icon:BookOpen},
 {id:'faculty',label:'Faculty Accounts',icon:Users},
 {id:'reports',label:'Schedule Reports',icon:Settings2}
] as const;

export function FacultySidebar({active,onNavigate,isAdmin}:{
 active:string;onNavigate:(id:string)=>void;isAdmin:boolean;
}){
 const [expanded,setExpanded]=useState(false);
 const [adminOpen,setAdminOpen]=useState(()=>adminItems.some(x=>x.id===active));
 const adminSelected=adminItems.some(x=>x.id===active);
 const displayAdmin=adminOpen;
 return <aside className={expanded?'faculty-sidebar expanded':'faculty-sidebar'}
  aria-label="Faculty workspace navigation"
  onMouseEnter={()=>setExpanded(true)} onMouseLeave={()=>setExpanded(false)}>
  <div className="faculty-sidebar-heading">
   <button type="button" className="faculty-sidebar-icon-button"
    aria-label={expanded?'Collapse navigation':'Expand navigation'}
    aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>
    {expanded?<PanelLeftClose size={20}/>:<Menu size={20}/>}
   </button>
   <span className="faculty-sidebar-text">Workspace</span>
  </div>
  <nav className="faculty-sidebar-links" aria-label="Faculty tools">
   {facultyItems.map(({id,label,icon:Icon})=><button key={id} type="button"
    className={active===id?'faculty-sidebar-link selected':'faculty-sidebar-link'}
    title={label} aria-label={label} aria-current={active===id?'page':undefined}
    onClick={()=>onNavigate(id)}>
    <Icon size={20} aria-hidden="true"/><span className="faculty-sidebar-text">{label}</span>
   </button>)}
   {isAdmin&&<div className="faculty-sidebar-admin">
    <button type="button" className={adminSelected?'faculty-sidebar-link admin-active':'faculty-sidebar-link'}
     aria-label="Admin Controls" title="Admin Controls" aria-expanded={displayAdmin}
     onClick={()=>{setAdminOpen(v=>!v);setExpanded(true)}}>
     <ShieldCheck size={20} aria-hidden="true"/>
     <span className="faculty-sidebar-text">Admin Controls</span>
     <ChevronDown size={16} className={displayAdmin?'faculty-sidebar-chevron open':'faculty-sidebar-chevron'}/>
    </button>
    {displayAdmin&&<div className="faculty-sidebar-submenu" role="group" aria-label="Administrative tools">
     {adminItems.map(({id,label,icon:Icon})=><button key={id} type="button"
      className={active===id?'faculty-sidebar-link selected':'faculty-sidebar-link'}
      title={label} aria-label={label} aria-current={active===id?'page':undefined}
      onClick={()=>onNavigate(id)}>
      <Icon size={19} aria-hidden="true"/><span className="faculty-sidebar-text">{label}</span>
     </button>)}
    </div>}
   </div>}
  </nav>
 </aside>;
}
