export function warsawDay(value=new Date()) {
  const d=new Date(value);
  return Number.isFinite(+d)?new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):'';
}
// One check per local day, from the beginning of the billing month through due day.
export function scanWindow(reminder,now=new Date()) {
  const today=warsawDay(now),due=warsawDay(reminder.mail_anchor_due_at||reminder.due_at);
  if(!due||!today)return 'skip';
  if(today>due)return 'expired';
  if(today<due.slice(0,7)+'-01')return 'skip';
  if(reminder.mail_last_checked_at&&warsawDay(reminder.mail_last_checked_at)===today)return 'skip';
  return 'scan';
}
