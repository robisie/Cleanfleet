import {createStateCodec,HttpError} from './crypto.js';
export const MAX_PART=20*1024*1024;
const allowedOrigins=['https://cleanfleet.pl','https://www.cleanfleet.pl'];
export function cleanEmail(value) {
  const email=String(value || '').trim().toLowerCase();
  if(email.length>254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email))throw new HttpError('Podaj poprawny adres e-mail.');
  return email;
}
export function cleanConfig(body) {
  const email=cleanEmail(body.email);if(!/@(?:o2|tlen|go2)\.pl$/.test(email))throw new HttpError('Ten moduł obsługuje skrzynki o2.pl, tlen.pl i go2.pl.');
  const senders=[...new Set(String(body.senders || '').split(/[\s,;]+/).filter(Boolean).map(cleanEmail))];
  if(!senders.length || senders.length>10)throw new HttpError('Podaj od 1 do 10 pełnych adresów nadawców banku.');
  const folder=String(body.folder || 'INBOX').trim();if(!folder || folder.length>128 || /[\x00-\x1f\x7f]/.test(folder))throw new HttpError('Niepoprawna nazwa folderu poczty.');
  return {email,senders,folder};
}
function utcDate(value) {
  if(!/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(value || ''))throw new HttpError('Wybierz daty wiadomości.');
  const d=new Date(value+'T00:00:00Z');if(!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==value)throw new HttpError('Niepoprawna data wiadomości.');return d;
}
export function period(from,to) {
  const begin=utcDate(from),end=utcDate(to);if(end<begin || end-begin>92*86400000)throw new HttpError('Zakres wiadomości może obejmować maksymalnie 93 dni.');
  return {from,to,since:new Date(begin.getTime()-86400000),before:new Date(end.getTime()+2*86400000)};
}
function received(message) {const d=new Date(message.internalDate);if(!Number.isFinite(d.getTime()))throw new HttpError('Poczta zwróciła niepoprawną datę wiadomości.',502);return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function senderMatches(message,senders) {return (message.envelope?.from || []).some(item=>senders.includes(String(item.address || '').toLowerCase()));}
export function filename(value) {return String(value || 'zalacznik').split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f<>:"|?*]/g,'_').replace(/^\.+/,'').slice(0,180) || 'zalacznik';}
export function attachments(node,result=[]) {
  if(!node)return result;
  const name=node.dispositionParameters?.filename || node.parameters?.name;
  if(node.childNodes?.length){for(const child of node.childNodes)attachments(child,result);}
  else if(name && (String(node.disposition).toLowerCase()==='attachment' || /\.(pdf|csv|xml|zip|txt|sta|mt940|xls|xlsx)$/i.test(name)) && /^[1-9]\d*(\.[1-9]\d*)*$/.test(node.part || '1') && Number.isInteger(node.size) && node.size>=0){result.push({part:node.part || '1',filename:filename(name),size:node.size});}
  return result;
}
export function createMailHandler({authorize,makeClient,secret,credentialStore}) {
  const credentialCodec=createStateCodec(secret,'mail-credentials-v1'),ticketCodec=createStateCodec(secret,'mail-attachments-v1');
  async function savedCredential(uid,session) {
    const stored=await credentialStore.get(uid);
    if(stored){const config=await credentialCodec.open(stored.ciphertext,uid,'mail-stored');return {row:{revision:config.revision},config};}
    if(!session)throw new HttpError('Połącz najpierw pocztę na bieżącą sesję.');
    let config;try{config=await credentialCodec.open(session,uid,'mail-session');}catch(_){throw new HttpError('Sesja poczty wygasła. Wpisz hasło i połącz pocztę ponownie.',401);}
    return {row:{revision:config.revision},config};
  }
  async function mailbox(config,operation) {
    let phase='connect';const client=makeClient(config);const timer=setTimeout(()=>client.close(),70000);
    try{await client.connect();phase='folder';await client.mailboxOpen(config.folder,{readOnly:true});phase='operation';return await operation(client);}
    catch(error){
      if(error instanceof HttpError)throw error;
      const codes=['AUTHENTICATIONFAILED','AUTHORIZATIONFAILED','UNAVAILABLE','PRIVACYREQUIRED','CONTACTADMIN','NONEXISTENT','ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ETIMEOUT','CONNECT_TIMEOUT','GREETING_TIMEOUT','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE','NO','BAD'];
      const code=codes.includes(error.code)?error.code:'UNKNOWN';
      const server=codes.includes(error.serverResponseCode)?error.serverResponseCode:'';
      console.warn('CF_MAIL_FAILURE '+JSON.stringify({phase,code,server,authenticationFailed:Boolean(error.authenticationFailed)}));
      if(error.authenticationFailed)throw new HttpError('Serwer o2 odrzucił logowanie'+(server?' ('+server+')':'')+'. Połączenie działa, ale serwer nie zaakceptował dostępu do skrzynki. Sprawdź pełny adres konta; jeśli te same dane działają w programie pocztowym, przekaż ten komunikat do sprawdzenia blokady po stronie o2.',502);
      if(phase==='folder')throw new HttpError('Zalogowano do o2, ale nie udało się otworzyć folderu poczty. Dla skrzynki odbiorczej wpisz INBOX.',502);
      if(phase==='operation')throw new HttpError('Zalogowano do o2, ale nie udało się odczytać wiadomości. Spróbuj ponownie.',502);
      if(['ENOTFOUND','EAI_AGAIN'].includes(code))throw new HttpError('Serwer aplikacji nie może odnaleźć serwera o2 (DNS: '+code+'). To nie jest błąd hasła.',502);
      throw new HttpError('Nie udało się zestawić połączenia z serwerem o2 ('+code+'). To nie potwierdza błędnego hasła.',502);
    }
    finally{clearTimeout(timer);try{client.close();}catch(_){}}
  }
  return async request=>{
    const origin=request.headers.get('Origin')||'';
    const headers={'Access-Control-Allow-Origin':allowedOrigins.includes(origin)?origin:allowedOrigins[0],'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Cache-Control':'no-store','Vary':'Origin'};
    const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json'}});
    try {
      if(origin && !allowedOrigins.includes(origin))throw new HttpError('Niedozwolone źródło żądania.',403);
      if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
      if(request.method!=='POST')throw new HttpError('Niedozwolona metoda.',405);
      const uid=await authorize(request),raw=await request.text();if(raw.length>20000)throw new HttpError('Żądanie jest zbyt duże.',413);
      let body;try{body=JSON.parse(raw);}catch(_){throw new HttpError('Niepoprawne żądanie.');}
      if(!body || typeof body!=='object' || Array.isArray(body))throw new HttpError('Niepoprawne żądanie.');
      if(body.action==='config'){
        if(!body.session && !await credentialStore.get(uid))return json({configured:false});
        const {config}=await savedCredential(uid,body.session);return json({configured:true,email:config.email,senders:config.senders,folder:config.folder});
      }
      if(body.action==='save'){
        const config=cleanConfig(body);let password=typeof body.password==='string'?body.password:'';
        if(body.useSavedPassword===true){const saved=await savedCredential(uid,body.session);if(saved.config.email!==config.email)throw new HttpError('Dla nowego adresu wpisz nowe hasło.');password=saved.config.password;}
        if(!password || password.length>1024 || /[\x00\r\n]/.test(password))throw new HttpError('Wpisz hasło do programu pocztowego.');
        config.password=password;await mailbox(config,async()=>{});
        const revision=crypto.randomUUID();
        const ciphertext=await credentialCodec.seal({...config,revision,userId:uid,scope:'mail-stored',expires:9999999999999});
        await credentialStore.set(uid,{ciphertext});
        const session=await credentialCodec.seal({...config,revision,userId:uid,scope:'mail-session',expires:Date.now()+60*60000});
        return json({configured:true,email:config.email,senders:config.senders,folder:config.folder,session});
      }
      if(body.action==='list'){
        const dates=period(body.from,body.to);const {row,config}=await savedCredential(uid,body.session);
        return await mailbox(config,async client=>{
          const uids=await client.search({since:dates.since,before:dates.before,or:config.senders.map(from=>({from}))},{uid:true});
          if(!uids || !uids.length)return json({attachments:[],messageCount:0});
          if(uids.length>200)throw new HttpError('Znaleziono ponad 200 wiadomości. Zawęź daty lub listę nadawców.',422);
          const messages=await client.fetchAll(uids,{uid:true,envelope:true,bodyStructure:true,internalDate:true},{uid:true});
          const result=[];let count=0;
          for(const message of messages){
            if(!senderMatches(message,config.senders))continue;
            const day=received(message);if(day<dates.from || day>dates.to)continue;count++;
            for(const part of attachments(message.bodyStructure)){
              if(part.size>MAX_PART)throw new HttpError('Załącznik „'+part.filename+'” przekracza limit 20 MB. Pobierz go bezpośrednio z poczty.',422);
              if(result.length>=100)throw new HttpError('Znaleziono ponad 100 załączników. Zawęź daty.',422);
              const ticket=await ticketCodec.seal({scope:'mail-part',userId:uid,expires:Date.now()+30*60000,revision:row.revision,uid:message.uid,uidValidity:String(client.mailbox.uidValidity),part:part.part,size:part.size,filename:part.filename,from:dates.from,to:dates.to});
              result.push({ticket,filename:part.filename,size:part.size,received:day,subject:String(message.envelope?.subject || '').slice(0,300),sender:message.envelope.from.map(item=>item.address).join(', ')});
            }
          }
          return json({attachments:result,messageCount:count});
        });
      }
      if(body.action==='attachment'){
        const state=await ticketCodec.open(body.ticket,uid,'mail-part');const {row,config}=await savedCredential(uid,body.session);
        if(state.revision!==row.revision)throw new HttpError('Połączenie z pocztą zmieniono. Ponownie wyszukaj załączniki.',409);
        return await mailbox(config,async client=>{
          if(String(client.mailbox.uidValidity)!==state.uidValidity)throw new HttpError('Folder poczty zmienił się. Ponownie wyszukaj załączniki.',409);
          const message=await client.fetchOne(state.uid,{envelope:true,bodyStructure:true,internalDate:true},{uid:true});
          if(!message || !senderMatches(message,config.senders) || received(message)<state.from || received(message)>state.to)throw new HttpError('Wiadomość jest już niedostępna w wybranym zakresie.',410);
          const part=attachments(message.bodyStructure).find(part=>part.part===state.part && part.size===state.size && part.filename===state.filename);
          if(!part)throw new HttpError('Załącznik zmienił się. Ponownie wyszukaj pocztę.',409);
          const downloaded=await client.download(state.uid,state.part,{uid:true,maxBytes:MAX_PART+1});
          const chunks=[];let size=0;for await(const chunk of downloaded.content){size+=chunk.byteLength;if(size>MAX_PART){downloaded.content.destroy?.();throw new HttpError('Załącznik przekracza 20 MB.',422);}chunks.push(new Uint8Array(chunk));}
          const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
          if(!size && part.size>0)throw new HttpError('Pobieranie załącznika jest niepełne. Spróbuj ponownie.',502);
          return new Response(bytes,{headers:{...headers,'Content-Type':'application/octet-stream'}});
        });
      }
      throw new HttpError('Nieznana operacja.');
    }catch(error){return json({error:error instanceof HttpError?error.message:'Wystąpił błąd pobierania poczty. Spróbuj ponownie.'},error instanceof HttpError?error.status:500);}
  };
}

