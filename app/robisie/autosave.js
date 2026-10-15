const withoutUndo=({_undo,...value})=>value;
// One durable undo step; never nest prior snapshots inside subsequent saves.
export function snapshot(payload){const {_undo,...value}=payload;return structuredClone(value);}
export const samePayload=(a,b)=>JSON.stringify(withoutUndo(a))===JSON.stringify(withoutUndo(b));
export function withUndo(payload,previous){const value=snapshot(payload);if(previous&&!samePayload(value,previous))value._undo={savedAt:new Date().toISOString(),payload:snapshot(previous)};else if(previous?._undo)value._undo=structuredClone(previous._undo);return value;}
export class WriteQueue{
 constructor(onChange=()=>{}){this.tail=Promise.resolve();this.pending=0;this.onChange=onChange;}
 run(task){this.pending++;this.onChange();const next=this.tail.then(task);this.tail=next.catch(()=>{});return next.finally(()=>{this.pending--;this.onChange();});}
 idle(){return this.tail;}
}
export class DraftStore{
 constructor(storage,owner){this.storage=storage;this.owner=owner;}
 key(){return 'robisie-autosave-drafts-v1:'+this.owner();}
 read(){try{return JSON.parse(this.storage()?.getItem(this.key())||'{}');}catch{return {};}}
 put(key,revision,payload){const drafts=this.read();drafts[key]={revision,payload:snapshot(payload)};this.storage()?.setItem(this.key(),JSON.stringify(drafts));}
 remove(key){try{const drafts=this.read();delete drafts[key];if(Object.keys(drafts).length)this.storage()?.setItem(this.key(),JSON.stringify(drafts));else this.storage()?.removeItem(this.key());}catch{/* A confirmed database save remains valid if browser storage is unavailable. */}}
}

// Keep edits made during a request, while accepting new server metadata and derived fields.
export function mergeEdits(saved,before,live){
 const result=structuredClone(saved);
 for(const key of new Set([...Object.keys(before),...Object.keys(live)])){
  if(key==='_undo'||JSON.stringify(before[key])===JSON.stringify(live[key]))continue;
  if(!(key in live)){delete result[key];continue;}
  if(before[key]&&live[key]&&!Array.isArray(live[key])&&typeof before[key]==='object'&&typeof live[key]==='object')result[key]=mergeEdits(saved[key]||{},before[key],live[key]);
  else result[key]=structuredClone(live[key]);
 }
 return result;
}
