/** Campus scheduling workload policy configured for this AIS implementation.
 * Full-time: first six sections are regular; all subsequent sections are extra.
 * Preparations are grouped by curriculum course id (same subject taught to multiple blocks).
 * 5th and 6th regular sections receive 1 additional *credit unit*, equivalent
 * to 2 credited weekly hours, only when they introduce a new preparation.
 * Extra load receives teaching hours only: no preparation credits or multiplier.
 * 40 credited hours is a target, not a fabricated total.
 */
export type WorkloadInput={
 id:number;curriculumCourseId:number;courseCode:string;courseTitle:string;
 units:number|null;weeklyTeachingHours:number;sortKey:string;
};
export type WorkloadResult=WorkloadInput&{
 position:number;category:'regular'|'extra';preparationKey:string;
 sharedPreparation:boolean;preparationHours:number;bonusHours:number;
 creditedHours:number|null;teachingHours:number;note:string;
};
export function calculateFacultyWorkload(entries:WorkloadInput[],fullTime:boolean):WorkloadResult[]{
 const ordered=[...entries].sort((a,b)=>a.sortKey.localeCompare(b.sortKey)||a.id-b.id);
 const counted=new Set<string>();
 return ordered.map((entry,index)=>{
  const position=index+1;
  const regular=fullTime&&position<=6;
  const category=fullTime&&!regular?'extra':'regular';
  const preparationKey=entry.courseCode.replace(/\\s+/g,'').toUpperCase()||String(entry.curriculumCourseId);
  const samePreparation=regular&&counted.has(preparationKey);
  const units=entry.units;
  const teachingHours=entry.weeklyTeachingHours;
  const valid=units!==null&&Number.isFinite(units)&&units>=0;
  // The slot's actual teaching duration always counts. Preparation is credited only once
  // per distinct curriculum subject within the first six regular sections.
  const preparationHours=regular&&valid&&!samePreparation?units!:0;
  if(regular&&!samePreparation)counted.add(preparationKey);
  const bonusHours=regular&&position>=5&&position<=6&&valid&&!samePreparation?2:0;
  const creditedHours=valid?Number((teachingHours+preparationHours+bonusHours).toFixed(2)):null;
  return {...entry,position,category,preparationKey,
   sharedPreparation:samePreparation,preparationHours,bonusHours,creditedHours,teachingHours,
   note:!valid?'Verify course units before computing WHE':
    category==='extra'?'Extra load: teaching only, no preparation credit':
    samePreparation?'Shared preparation: teaching credited; no second preparation credit':
    bonusHours?'Fifth/sixth section: one additional credit unit (2 credited hours)':'Teaching plus one course preparation'
  };
 });
}
export const FULL_TIME_WEEKLY_TARGET=40;
