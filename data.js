import {normalizeEvent,applyBbo,settlementEstimate} from './engine.js';
const US='https://gateway.polymarket.us';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export class MarketAPI {
 constructor(proxy=''){this.proxy=proxy.replace(/\/$/,'');this.sports=[];this.cache=new Map();}
 async request(path,{signal,ttl=0}={}){
  const cached=this.cache.get(path);if(cached&&Date.now()-cached.at<ttl)return cached.data;
  const url=this.proxy?`${this.proxy}/market${path}`:US+path;
  for(let i=0;i<3;i++){
   const timeout=AbortSignal.timeout(18000), combined=signal?AbortSignal.any([signal,timeout]):timeout;
   let r;try{r=await fetch(url,{signal:combined,cache:'no-store'});}catch(e){if(signal?.aborted)throw e;throw new Error('Cannot reach Polymarket US. Check connectivity or configure the included proxy in Settings. '+(e.name==='TimeoutError'?'Request timed out.':''));}
   if(r.status===429||r.status>=500){if(i<2){await pause(Math.max(1000,Math.min(8000,Number(r.headers.get('Retry-After')||0)*1000||2**i*1000)));continue;}}
   if(!r.ok)throw new Error(`Polymarket US returned HTTP ${r.status}. This is a connection error, not an empty schedule.`);
   const data=await r.json();this.cache.set(path,{at:Date.now(),data});if(this.cache.size>1000)this.cache.delete(this.cache.keys().next().value);return data;
  }
 }
 async catalog(signal){const d=await this.request('/v2/sports',{signal,ttl:3600000});if(!Array.isArray(d.sports))throw new Error('Unexpected sports catalog format.');this.sports=d.sports;return this.sports;}
 async scan({sport='all',onPage=()=>{},onProgress=()=>{},signal,maxPages=20}={}){
  if(!this.sports.length)await this.catalog(signal);
  const priority=['tennis','table-tennis','esports','basketball','football'];
  const list=this.sports.filter(s=>sport==='all'||s.slug===sport).sort((a,b)=>(priority.includes(a.slug)?priority.indexOf(a.slug):99)-(priority.includes(b.slug)?priority.indexOf(b.slug):99));
  let index=0,total=0;const errors=[],truncated=[],seen=new Set();
  await Promise.all(Array.from({length:Math.min(3,list.length)},async()=>{
   while(index<list.length){const sp=list[index++];let offset=0,finished=false;
    try{for(let page=0;page<maxPages;page++){
     if(signal?.aborted)throw new DOMException('Aborted','AbortError');
     const d=await this.request(`/v2/sports/${encodeURIComponent(sp.slug)}/events?limit=50&offset=${offset}&type=sport`,{signal});
     if(!Array.isArray(d.events))throw new Error('Unexpected events format for '+sp.name);
     let fresh=0;const markets=[];
     for(const e of d.events){const key=sp.slug+':'+e.id;if(seen.has(key))continue;seen.add(key);fresh++;markets.push(...normalizeEvent(e,sp));}
     onPage(markets);total+=fresh;onProgress(`${sp.name} · ${total} events scanned`);
     if(d.events.length<50){finished=true;break;}if(!fresh)throw new Error('Pagination repeated a page; scan stopped to prevent an endless loop.');
     offset+=d.events.length;await pause(150);
    }if(!finished)truncated.push(sp.name);
    }catch(e){if(signal?.aborted)throw e;errors.push(`${sp.name}: ${e.message}`);}
   }
  }));return {total,errors,truncated};
 }
 async verify(markets,signal){let i=0;const errors=[];await Promise.all(Array.from({length:Math.min(3,markets.length)},async()=>{while(i<markets.length){const m=markets[i++];try{const d=await this.request(`/v1/markets/${encodeURIComponent(m.slug)}/bbo`,{signal});applyBbo(m,d);delete m.bookError;}catch(e){if(signal?.aborted)throw e;m.verifiedAt=0;m.bookError=e.message;errors.push(`${m.title}: ${e.message}`);}await pause(150);}}));return errors;}
 async settlements(bet){const results={};const errors=[];for(const l of bet.legs){if(!l.slug)continue;try{const d=await this.request(`/v1/markets/${encodeURIComponent(l.slug)}/settlement`);if(typeof d.settlement==='number')results[l.slug]=d.settlement;}catch(e){errors.push(e.message);}}return {estimate:settlementEstimate(bet.legs,bet.potential,results),errors,at:Date.now()};}
}
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const TEAM_SPORTS=new Set(['basketball','football','baseball','ice-hockey','soccer','rugby','cricket']);
export class ResearchAPI {
 constructor(proxy=''){this.proxy=proxy.replace(/\/$/,'');this.cache=new Map();}
 async get(path){const url=this.proxy?`${this.proxy}/research/${path}`:`https://www.thesportsdb.com/api/v1/json/123/${path}`;const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error(`Research provider HTTP ${r.status}`);return r.json();}
 async team(name){
  const result=await this.get('searchteams.php?t='+encodeURIComponent(name));
  const teams=(result.teams||[]).filter(t=>[t.strTeam,...String(t.strAlternate||'').split(';')].some(x=>normalize(x)===normalize(name)));
  if(teams.length!==1)throw new Error('No unique exact team match for '+name);
  const t=teams[0],d=await this.get('eventslast.php?id='+encodeURIComponent(t.idTeam));
  const events=(d.results||[]).filter(e=>e.intHomeScore!==null&&e.intAwayScore!==null&&Number.isFinite(Number(e.intHomeScore))&&Number.isFinite(Number(e.intAwayScore))&&Date.parse(e.dateEvent)<Date.now()&&(e.idHomeTeam===t.idTeam||e.idAwayTeam===t.idTeam)).sort((a,b)=>b.dateEvent.localeCompare(a.dateEvent));
  return {name,id:t.idTeam,sport:t.strSport,source:`https://www.thesportsdb.com/team/${t.idTeam}`,events:events.map(e=>({id:e.idEvent,date:e.dateEvent,opponent:e.idHomeTeam===t.idTeam?e.strAwayTeam:e.strHomeTeam,home:e.idHomeTeam===t.idTeam,for:Number(e.idHomeTeam===t.idTeam?e.intHomeScore:e.intAwayScore),against:Number(e.idHomeTeam===t.idTeam?e.intAwayScore:e.intHomeScore)}))};
 }
 async research(m){
  const key=m.outcomes.map(x=>x.teamId).sort().join(':');const c=this.cache.get(key);if(c&&Date.now()-c.at<3600000)return c;
  const unavailable=reason=>({available:false,supported:false,at:Date.now(),confidence:'Unavailable',summary:reason,teams:[],sources:[]});
  if(!TEAM_SPORTS.has(m.sport)){const r=unavailable('Research Unavailable — no verified free current player/roster feed is connected for this sport. Rankings, injuries, surface/map statistics and last 5/10/20 results are not inferred from market prices.');this.cache.set(key,r);return r;}
  try{
   const a=await this.team(m.outcomes[0].name);await pause(600);const b=await this.team(m.outcomes[1].name);
   if(a.sport!==b.sport)throw new Error('Sport mismatch between research identities');
   if(!a.events.length||!b.events.length)throw new Error('Recent completed results are missing for one or both teams');
   const teams=[a,b].map(t=>({...t,windows:[5,10,20].map(n=>{const sample=t.events.slice(0,n);return {n,count:sample.length,wins:sample.filter(e=>e.for>e.against).length,draws:sample.filter(e=>e.for===e.against).length};})}));
   const r={available:true,supported:false,at:Date.now(),confidence:'Limited evidence',teams,sources:[a.source,b.source],summary:'Both teams matched by name. TheSportsDB free history may contain only home games and fewer than 5 results; its update schedule is not guaranteed. This biased sample does not support an independent winner prediction. Opponent strength, injuries and lineups remain unverified.'};this.cache.set(key,r);return r;
  }catch(e){const r=unavailable(e.message+'. No winner prediction generated.');this.cache.set(key,r);return r;}
 }
}
