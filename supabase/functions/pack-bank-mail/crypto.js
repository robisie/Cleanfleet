const encoder = new TextEncoder();
export class HttpError extends Error {
  constructor(message, status = 400, retryAfter = 0) { super(message); this.status = status; this.retryAfter = retryAfter; }
}
export const b64 = bytes => btoa(Array.from(new Uint8Array(bytes), b => String.fromCharCode(b)).join(''));
export const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export function createStateCodec(secret, purpose = 'export-state') {
  const keyPromise = crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']).then(key => crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('CleanFleet/Mail/v1'), info: encoder.encode(purpose) }, key, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']));
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