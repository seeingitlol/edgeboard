import {initialState,validateBackup} from './engine.js';
let dbPromise;
export function db(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('edgeboard-private',1);r.onupgradeneeded=()=>{for(const store of ['state','images','cache'])r.result.createObjectStore(store);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return dbPromise;}
export async function read(store,key){const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function write(store,key,value){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
export async function load(){const s=await read('state','main');return s?validateBackup(s):initialState();}
export async function commit(fn,queue=true){const d=await db();return new Promise((resolve,reject)=>{const tx=d.transaction('state','readwrite'),store=tx.objectStore('state'),r=store.get('main');let result,current;r.onsuccess=()=>{try{current=r.result?validateBackup(r.result):initialState();result=fn(current);validateBackup(current);if(queue)enqueue(current);store.put(current,'main');}catch(e){tx.abort();reject(e);}};tx.oncomplete=()=>resolve({state:current,result});tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Ledger update aborted.'));});}
export async function save(s){return commit(current=>{if(current.revision!==s.revision)throw new Error('Ledger changed in another tab. Reload before saving.');Object.assign(current,s);},false);}
export async function hashFile(file){const a=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return Array.from(new Uint8Array(a)).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function snapshot(s){const {outbox,...data}=structuredClone(s);data.settings={...data.settings,sheetsUrl:'',proxy:''};return data;}
export function enqueue(s){s.revision++;s.outbox=[{id:crypto.randomUUID(),revision:s.revision,createdAt:new Date().toISOString(),snapshot:snapshot(s)}];}
let syncing=false;
export async function sync(s,onStatus=()=>{}){
 if(syncing||!s.settings.proxy||!s.outbox.length)return;
 const token=sessionStorage.getItem('edgeboard-sync-token');if(!token){onStatus('Unlock sync in Settings.');return;}
 syncing=true;const item=structuredClone(s.outbox[0]);
 try{onStatus('Syncing…');const r=await fetch(s.settings.proxy.replace(/\/$/,'')+'/sync',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify(item),signal:AbortSignal.timeout(25000)});const d=await r.json();if(!r.ok||d.ok!==true||d.ack!==item.id)throw new Error(d.error||'Backend did not confirm this change.');const ack=await commit(current=>{current.outbox=current.outbox.filter(x=>x.id!==item.id);current.syncAt=new Date().toISOString();},false);Object.assign(s,ack.state);onStatus('Synced '+new Date(s.syncAt).toLocaleTimeString());}
 catch(e){onStatus('Sync queued: '+e.message);}finally{syncing=false;}
}
export function download(name,data,type='application/json'){const blob=new Blob([data],{type});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export function csv(bets){const rows=[['Bet ID','Placed','Selections','Stake','Accepted multiplier','Potential payout','Status','Received payout','Realized PL','Settled','Sport']];for(const b of bets)rows.push([b.id,b.placedAt,b.legs.map(l=>l.selection).join(' | '),b.stake/100,b.multiplier,b.potential/100,b.status,b.payout/100,b.status==='pending'?'':(b.payout-b.stake)/100,b.settledAt||'',b.legs.map(l=>l.sportName||l.sport||'').join(' | ')]);return rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');}
