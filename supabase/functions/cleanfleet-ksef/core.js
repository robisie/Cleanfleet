const encoder = new TextEncoder();
export class HttpError extends Error {
  constructor(message, status = 400, retryAfter = 0) { super(message); this.status = status; this.retryAfter = retryAfter; }
}
export const b64 = bytes => btoa(Array.from(new Uint8Array(bytes), b => String.fromCharCode(b)).join(''));
export const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export const hash = async bytes => b64(await crypto.subtle.digest('SHA-256', bytes));
export function monthRange(month) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month || '')) throw new HttpError('Wybierz poprawny miesiąc.');
  const [year, number] = month.split('-').map(Number);
  return { dateType: 'Issue', from: new Date(Date.UTC(year, number - 1, 1)).toISOString(), to: new Date(Date.UTC(year, number, 1) - 1).toISOString() };
}
export function validNip(nip) {
  return /^\d{10}$/.test(nip) && [6,5,7,2,3,4,5,6,7].reduce((sum, weight, i) => sum + weight * Number(nip[i]), 0) % 11 === Number(nip[9]);
}
function der(bytes, offset) {
  const start = offset; const tag = bytes[offset++]; let length = bytes[offset++];
  if (length & 128) { const count = length & 127; if (!count || count > 4) throw new Error('DER'); length = 0; for (let i=0;i<count;i++) length = length * 256 + bytes[offset++]; }
  const end = offset + length; if (end > bytes.length) throw new Error('DER');
  return { tag, start, body: offset, end };
}
export async function certificateKey(certificate) {
  const bytes = unb64(certificate);
  const algorithm = { name: 'RSA-OAEP', hash: 'SHA-256' };
  try { return await crypto.subtle.importKey('spki', bytes, algorithm, false, ['encrypt']); } catch (_) { /* X.509 certificate */ }
  const root = der(bytes, 0), tbs = der(bytes, root.body);
  let offset = tbs.body; if (bytes[offset] === 0xa0) offset = der(bytes, offset).end;
  // serial, signature, issuer, validity, subject precede SubjectPublicKeyInfo.
  for (let i=0;i<5;i++) offset = der(bytes, offset).end;
  const spki = der(bytes, offset);
  return crypto.subtle.importKey('spki', bytes.slice(spki.start, spki.end), algorithm, false, ['encrypt']);
}
export function createStateCodec(secret, purpose = 'export-state') {
  const keyPromise = crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']).then(key => crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('CleanFleet/KSeF/v1'), info: encoder.encode(purpose) }, key, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']));
  return {
    async seal(state) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv}, await keyPromise, encoder.encode(JSON.stringify(state))));
      const bytes = new Uint8Array(iv.length + encrypted.length); bytes.set(iv); bytes.set(encrypted, iv.length);
      return b64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    },
    async open(ticket, userId, scope) {
      try {
        if (typeof ticket !== 'string' || ticket.length > 14000) throw new Error();
        const bytes = unb64(ticket.replace(/-/g,'+').replace(/_/g,'/'));
        const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)}, await keyPromise, bytes.slice(12));
        const state = JSON.parse(new TextDecoder().decode(plain));
        if (state.userId !== userId || state.scope !== scope || !Number.isFinite(state.expires) || state.expires <= Date.now()) throw new Error();
        return state;
      } catch (_) { throw new HttpError('Sesja pobierania wygasła. Uruchom pobieranie ponownie.', 401); }
    }
  };
}
const MAX = 200 * 1024 * 1024;
const origins = ['https://cleanfleet.pl','https://www.cleanfleet.pl'];
export function createHandler({authorize, secret, credentialStore, fetchImpl = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  const codec = createStateCodec(secret);
  const credentials = createStateCodec(secret, 'saved-credentials-v1');
  function environmentFor(value) {
    if (!['production','test'].includes(value)) throw new HttpError('Niepoprawne środowisko KSeF.');
    return value;
  }
  async function savedFor(userId, environment) {
    if (!credentialStore) throw new HttpError('Zapisywanie tokenu jest chwilowo niedostępne.',503);
    return credentialStore.get(userId, environment);
  }
  async function api(environment, path, token, body) {
    const base = environment === 'test' ? 'https://api-test.ksef.mf.gov.pl/v2' : 'https://api.ksef.mf.gov.pl/v2';
    let response;
    try { response = await fetchImpl(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {}) }, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(25000), redirect:'error' }); }
    catch (_) { throw new HttpError('KSeF nie odpowiada. Spróbuj ponownie za chwilę.', 502); }
    if (response.status === 429) throw new HttpError('KSeF ograniczył liczbę zapytań. Spróbuj za chwilę.', 429, Math.min(120, Math.max(4, Number(response.headers.get('Retry-After')) || 30)));
    if (!response.ok) throw new HttpError(response.status === 401 || response.status === 403 ? 'KSeF odrzucił dostęp. Sprawdź NIP, token i uprawnienie do odczytu faktur.' : 'KSeF odrzucił zapytanie (HTTP ' + response.status + '). Spróbuj ponownie.', 502);
    return response.json();
  }
  return async request => {
    const origin = request.headers.get('Origin') || '';
    const headers = { 'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0], 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control':'no-store', 'Vary':'Origin' };
    const json = (body,status=200) => new Response(JSON.stringify(body), {status,headers:{...headers,'Content-Type':'application/json'}});
    try {
      if (origin && !origins.includes(origin)) throw new HttpError('Niedozwolone źródło żądania.',403);
      if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
      if (request.method !== 'POST') throw new HttpError('Niedozwolona metoda.',405);
      const userId = await authorize(request);
      const raw = await request.text(); if (raw.length > 20000) throw new HttpError('Żądanie jest za duże.',413);
      let body; try { body = JSON.parse(raw); } catch (_) { throw new HttpError('Niepoprawne żądanie.'); }
      if (!body || typeof body !== 'object') throw new HttpError('Niepoprawne żądanie.');
      if (body.action === 'credentials') {
        const environment = environmentFor(body.environment);
        const saved = await savedFor(userId, environment);
        return json({configured:Boolean(saved),nip:saved?.nip || '',environment});
      }
      if (body.action === 'save-credentials') {
        const environment = environmentFor(body.environment);
        const nip = String(body.nip || '').replace(/[\s-]/g,'');
        const token = typeof body.token === 'string' ? body.token.trim() : '';
        if (!validNip(nip)) throw new HttpError('Podaj poprawny NIP przed zapisaniem tokenu.');
        if (!token || token.length > 8000) throw new HttpError('Wklej nowy token KSeF, który chcesz zapisać.');
        if (!credentialStore) throw new HttpError('Zapisywanie tokenu jest chwilowo niedostępne.',503);
        const ciphertext = await credentials.seal({scope:'credential',userId,environment,nip,token,expires:Number.MAX_SAFE_INTEGER});
        await credentialStore.set(userId,environment,{nip,ciphertext});
        return json({configured:true,nip,environment});
      }
      if (body.action === 'start') {
        const nip = String(body.nip || '').replace(/[\s-]/g,'');
        const environment = environmentFor(body.environment);
        let token = typeof body.token === 'string' ? body.token.trim() : '';
        if (!validNip(nip)) throw new HttpError('Podaj poprawny NIP.');
        if (body.useSaved === true) {
          const saved = await savedFor(userId, environment);
          if (!saved || saved.nip !== nip) throw new HttpError('Brak zapisanego tokenu dla tego NIP-u. Wklej token i kliknij Zapisz.');
          let state;
          try { state = await credentials.open(saved.ciphertext,userId,'credential'); }
          catch (_) { throw new HttpError('Zapisany token wymaga ponownego zapisania. Wklej go i kliknij Zapisz.',409); }
          if (state.environment !== environment || state.nip !== nip) throw new HttpError('Zapisany token nie pasuje do wybranej firmy.',409);
          token = state.token;
        }
        if (!token || token.length > 8000) throw new HttpError('Podaj token KSeF z uprawnieniem do odczytu faktur.');
        const dateRange = monthRange(body.month);
        const certificates = await api(environment,'/security/public-key-certificates');
        async function keyFor(usage) {
          const cert = certificates.filter(c => c.usage?.includes(usage) && Date.parse(c.validFrom) <= Date.now() && Date.parse(c.validTo) > Date.now()).sort((a,b) => Date.parse(b.validFrom)-Date.parse(a.validFrom))[0];
          if (!cert) throw new HttpError('Brak aktualnego certyfikatu KSeF.',502);
          return {key:await certificateKey(cert.certificate),publicKeyId:cert.publicKeyId};
        }
        const tokenKey = await keyFor('KsefTokenEncryption');
        const challenge = await api(environment,'/auth/challenge',null,{});
        if (!Number.isFinite(challenge.timestampMs)) throw new HttpError('Niepoprawna odpowiedź KSeF.',502);
        const encryptedToken = b64(await crypto.subtle.encrypt({name:'RSA-OAEP'},tokenKey.key,encoder.encode(token + '|' + challenge.timestampMs)));
        const auth = await api(environment,'/auth/ksef-token',null,{challenge:challenge.challenge,contextIdentifier:{type:'Nip',value:nip},encryptedToken,publicKeyId:tokenKey.publicKeyId});
        let authenticated = false;
        for (let i=0;i<20;i++) {
          const state = await api(environment,'/auth/' + encodeURIComponent(auth.referenceNumber),auth.authenticationToken.token);
          if (state.status.code === 200) { authenticated = true; break; }
          if (state.status.code !== 100) throw new HttpError('KSeF odrzucił token. Sprawdź NIP i uprawnienia.',502);
          await pause(1000);
        }
        if (!authenticated) throw new HttpError('KSeF nadal sprawdza dostęp. Spróbuj ponownie za chwilę.',504);
        const access = (await api(environment,'/auth/token/redeem',auth.authenticationToken.token,{})).accessToken;
        const expires = Math.min(Date.parse(access.validUntil)-10000,Date.now()+30*60*1000);
        if (!Number.isFinite(expires) || expires <= Date.now()) throw new HttpError('Sesja KSeF wygasła.',502);
        const exportKey = await keyFor('SymmetricKeyEncryption'); const jobs=[];
        for (const [kind,subjectType] of [['sales','Subject1'],['purchases','Subject2']]) {
          const key = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(16));
          const result = await api(environment,'/invoices/exports',access.token,{encryption:{encryptedSymmetricKey:b64(await crypto.subtle.encrypt({name:'RSA-OAEP'},exportKey.key,key)),initializationVector:b64(iv),publicKeyId:exportKey.publicKeyId},onlyMetadata:false,compressionType:'Zip',filters:{subjectType,dateRange}});
          const ticket = await codec.seal({scope:'export',userId,expires,environment,month:body.month,kind,accessToken:access.token,reference:result.referenceNumber});
          jobs.push({kind,ticket,key:b64(key),iv:b64(iv)});
        }
        return json({month:body.month,environment,jobs});
      }
      if (body.action === 'status') {
        const state = await codec.open(body.ticket,userId,'export');
        const result = await api(state.environment,'/invoices/exports/' + encodeURIComponent(state.reference),state.accessToken);
        if (result.status.code === 100) return json({status:'pending',retryAfter:4});
        if (result.status.code !== 200) throw new HttpError('KSeF nie przygotował eksportu (status ' + result.status.code + '). Uruchom go ponownie.',502);
        const pack = result.package;
        if (!pack || pack.isTruncated) throw new HttpError('Eksport KSeF przekracza limit i jest niepełny. Pobierz go bezpośrednio w KSeF.',422);
        if (pack.compressionType !== 'Zip' || !Number.isInteger(pack.invoiceCount) || pack.invoiceCount < 0 || !Number.isFinite(pack.size) || pack.size < 0) throw new HttpError('Niepoprawny eksport KSeF.',502);
        if (pack.size > MAX) throw new HttpError('Paczka przekracza 200 MB. Pobierz ją bezpośrednio w KSeF.',422);
        const ordered = [...(pack.parts || [])].sort((a,b)=>a.ordinalNumber-b.ordinalNumber); const parts=[];
        if (ordered.length > 16 || (pack.invoiceCount > 0 && !ordered.length)) throw new HttpError('Niepoprawne części eksportu KSeF.',502);
        for (let i=0;i<ordered.length;i++) {
          const part = ordered[i]; const url = new URL(part.url);
          if (part.ordinalNumber !== i+1 || part.method !== 'GET' || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !Number.isInteger(part.encryptedPartSize) || part.encryptedPartSize > 50*1024*1024+16 || part.encryptedPartSize < 16 || !Number.isInteger(part.partSize) || part.partSize < 0 || !/^[A-Za-z0-9+/]{43}=$/.test(part.encryptedPartHash || '') || !/^[A-Za-z0-9+/]{43}=$/.test(part.partHash || '')) throw new HttpError('Niepoprawna część eksportu KSeF.',502);
          const expires = Math.min(state.expires,Date.parse(part.expirationDate));
          if (!Number.isFinite(expires) || expires <= Date.now()) throw new HttpError('Link eksportu wygasł. Uruchom pobieranie ponownie.',410);
          parts.push({ordinal:part.ordinalNumber,partSize:part.partSize,partHash:part.partHash,ticket:await codec.seal({scope:'part',userId,expires,url:part.url,size:part.encryptedPartSize,hash:part.encryptedPartHash})});
        }
        if (ordered.reduce((sum,p)=>sum+p.partSize,0) !== pack.size) throw new HttpError('Rozmiar eksportu KSeF jest niezgodny.',502);
        return json({status:'ready',invoiceCount:pack.invoiceCount,size:pack.size,parts});
      }
      if (body.action === 'part') {
        const state = await codec.open(body.ticket,userId,'part');
        let response; try { response = await fetchImpl(state.url,{redirect:'error',signal:AbortSignal.timeout(90000)}); } catch (_) { throw new HttpError('Nie udało się pobrać części archiwum. Spróbuj ponownie.',502); }
        if (!response.ok || !response.body) throw new HttpError('Link do archiwum wygasł. Uruchom pobieranie ponownie.',502);
        const reader = response.body.getReader(), chunks=[]; let length=0;
        while (true) { const next=await reader.read(); if (next.done) break; length += next.value.length; if (length > state.size) { await reader.cancel(); throw new HttpError('Niezgodny rozmiar archiwum.',502); } chunks.push(next.value); }
        const bytes = new Uint8Array(length); let offset=0; for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
        if (length !== state.size || await hash(bytes) !== state.hash) throw new HttpError('Nie udało się zweryfikować archiwum. Pobierz je ponownie.',502);
        return new Response(bytes,{headers:{...headers,'Content-Type':'application/octet-stream'}});
      }
      throw new HttpError('Nieznana operacja.');
    } catch (error) { return json({error:error instanceof HttpError ? error.message : 'Wystąpił błąd pobierania. Spróbuj ponownie.',retryAfter:error instanceof HttpError ? error.retryAfter : 0},error instanceof HttpError ? error.status : 500); }
  };
}
