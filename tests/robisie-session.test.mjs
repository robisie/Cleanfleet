import test from 'node:test';
import assert from 'node:assert/strict';
import * as API from '../app/robisie/api.js';
test('sesja Robisię nie odczytuje ani nie usuwa sesji CleanFleet',()=>{
 const store=new Map([['sb-nxmrobbhfqijmbjjzbof-auth-token',JSON.stringify({access_token:'clean-fleet-test'})]]);
 globalThis.localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
 assert.equal(API.restoreSession(),null);
 store.set('robisie-auth-session-v1',JSON.stringify({access_token:'robisie-test'}));assert.equal(API.restoreSession().access_token,'robisie-test');
 API.logout();assert.ok(store.has('sb-nxmrobbhfqijmbjjzbof-auth-token'));assert.ok(!store.has('robisie-auth-session-v1'));
});
