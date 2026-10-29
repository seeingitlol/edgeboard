import {SOURCES,sourceKey,sourceLabel,sourceDetails,sourceGroups} from './sources.js';
import test from 'node:test';import assert from 'node:assert/strict';
import * as E from './engine.js';import {MarketAPI,ResearchAPI} from './data.js';import worker from './worker.js';
const placed=()=>({stake:500,potential:1500,multiplier:3,placedAt:new Date().toISOString(),legs:[{selection:'Test Alpha'},{selection:'Test Beta'}]});
function market(id,q=.7){return {id:String(id),eventId:'event'+id,slug:'market'+id,start:Date.now()+600000,open:true,supported:true,comboEnabled:true,verifiedAt:Date.now(),venue:'us',spread:.02,depth:{bid:100,ask:100},outcomes:[{name:'A'+id,teamId:'A'+id,probability:q,long:true,quote:q,tradable:true},{name:'B'+id,teamId:'B'+id,probability:1-q,long:false,quote:1-q,tradable:true}],favorite:{name:'A'+id,probability:q,quote:q,long:true}};}
const event=()=>({id:'1',slug:'sample',title:'Alpha vs Beta',startTime:new Date(Date.now()+3600000).toISOString(),active:true,closed:false,markets:[{id:'10',slug:'winner',active:true,closed:false,status:'MARKET_STATUS_OPEN',sportsMarketType:'tennis_match_winner',comboEnabled:true,bestBidQuote:{value:'.79'},bestAskQuote:{value:'.81'},marketSides:[{description:'Alpha',long:true,teamId:1,price:'.79',quote:{value:'.81'},tradable:true},{description:'Beta',long:false,teamId:2,price:'.81',quote:{value:'.21'},tradable:true}]}]});
test('unconfirmed starting deposit and incoming payment are not money',()=>{const s=E.initialState();assert.equal(E.metrics(s).bankroll,0);assert.equal(E.totalSaved(s),0);assert.throws(()=>E.logBet(s,placed()),/Insufficient/);});
test('pending wager, won receipt and ROI separate stake from profit',()=>{const s=E.initialState();E.deposit(s,2500);const b=E.logBet(s,placed());assert.equal(E.metrics(s).bankroll,2000);assert.equal(E.metrics(s).profit,0);E.settleBet(s,b.id,'won',1500);assert.equal(E.metrics(s).bankroll,3500);assert.equal(E.metrics(s).profit,1000);assert.equal(E.metrics(s).roi,2);assert.throws(()=>E.settleBet(s,b.id,'won',1500),/Already/);});
test('cashout, loss, void and withdrawal bookkeeping',()=>{const s=E.initialState();E.deposit(s,2500);let b=E.logBet(s,placed());E.settleBet(s,b.id,'lost',0);b=E.logBet(s,placed());E.settleBet(s,b.id,'cashed-out',300);b=E.logBet(s,placed());E.settleBet(s,b.id,'voided',500);assert.equal(E.metrics(s).bankroll,1800);assert.equal(E.metrics(s).profit,-700);assert.equal(E.metrics(s).losses,700);E.allocate(s,'iphone',500,'bankroll');assert.equal(E.metrics(s).bankroll,1300);assert.equal(E.totalSaved(s),500);});
test('duplicate IDs and screenshots rejected',()=>{const s=E.initialState();E.deposit(s,2500);E.logBet(s,{...placed(),ticketId:'ticket',screenshotHash:'hash'});assert.throws(()=>E.logBet(s,{...placed(),ticketId:'ticket'}),/already/);assert.throws(()=>E.logBet(s,{...placed(),screenshotHash:'hash'}),/screenshot/);});
test('branch reservations cannot be spent twice',()=>{const s=E.initialState();E.deposit(s,100);const root=E.startBranch(s,100);assert.equal(E.metrics(s).available,0);assert.throws(()=>E.startBranch(s,100));const b=E.logBet(s,{...placed(),stake:100,potential:200,multiplier:2,branchId:root.id});assert.throws(()=>E.splitBranch(s,root.id,[100,100]));E.settleBet(s,b.id,'won',200);E.splitBranch(s,root.id,[100,100]);assert.equal(E.metrics(s).available,0);assert.throws(()=>E.splitBranch(s,root.id,[100,100]),/already/);});
test('spent branch receipt cannot be reserved later',()=>{const s=E.initialState();E.deposit(s,100);const r=E.startBranch(s,100);const b=E.logBet(s,{...placed(),stake:100,potential:200,multiplier:2,branchId:r.id});E.settleBet(s,b.id,'won',200);E.allocate(s,'iphone',200,'bankroll');assert.throws(()=>E.splitBranch(s,r.id,[100,100]),/available/);});
test('incoming payment only funds confirmed savings; cannot overallocate',()=>{const s=E.initialState();assert.throws(()=>E.allocate(s,'iphone',100,'incoming'));E.receiveIncoming(s,90000);E.allocate(s,'iphone',35000,'incoming');E.allocate(s,'big-bear',30000,'incoming');E.allocate(s,'shopping',25000,'incoming');assert.equal(E.totalSaved(s),90000);assert.equal(E.metrics(s).bankroll,0);assert.throws(()=>E.allocate(s,'iphone',1,'incoming'));assert.throws(()=>E.receiveIncoming(s,90000));});
test('US parser never treats raw bid/ask side prices as probabilities',()=>{const m=E.normalizeEvent(event(),{name:'Tennis',slug:'tennis'})[0];assert.equal(m.favorite.name,'Alpha');assert.equal(m.favorite.probability,.8);assert.equal(m.outcomes[1].probability,1-.8);assert.equal(m.outcomes[1].quote,.21);assert.equal(m.verifiedAt,0);assert.equal(m.supported,true);});
test('three-way draw and binary yes/no props excluded',()=>{const e=event();e.markets[0].marketSides.push({description:'Draw',long:false,teamId:3});assert.equal(E.normalizeEvent(e)[0].supported,false);e.markets[0].marketSides.pop();e.markets[0].sportsMarketType='drawable_outcome';assert.equal(E.normalizeEvent(e)[0].supported,false);e.markets[0].sportsMarketType='tennis_match_winner';e.markets[0].marketSides[0].description='Yes';assert.equal(E.normalizeEvent(e)[0].supported,false);});
test('suspended and unknown lifecycle fail closed',()=>{let e=event();e.period='SUS';assert.equal(E.normalizeEvent(e)[0].open,false);e=event();e.markets[0].status='NEW_UNKNOWN';assert.equal(E.normalizeEvent(e)[0].open,false);});
test('startTime preferred over listing date; missing is not fabricated',()=>{const e=event();e.startDate='2020-01-01';assert.equal(E.normalizeEvent(e)[0].start,Date.parse(e.startTime));delete e.startTime;delete e.startDate;assert.equal(E.normalizeEvent(e)[0].start,null);});
test('time windows, sport filter, favorites and chronological sort',()=>{const now=Date.now();const a={...market(1),start:now+60000,sport:'tennis'},b={...market(2),start:now+3600000,sport:'basketball'};assert.deepEqual(E.filteredMarkets([b,a],{window:'15'},now).map(m=>m.id),['1']);assert.equal(E.filteredMarkets([b,a],{sport:'basketball',window:'all'},now).length,1);assert.equal(E.filteredMarkets([a],{lopsided:true,min:.75,max:.88},now).length,0);});
test('BBO uses correct long and short quotes and midpoint',()=>{const m=market(1);E.applyBbo(m,{marketData:{bestBid:{value:'.69'},bestAsk:{value:'.71'},longQuote:{value:'.71'},shortQuote:{value:'.31'},state:'MARKET_STATE_OPEN',bidShares:'100',askShares:'200'}});assert.equal(m.favorite.quote,.71);assert.equal(m.depth.ask,200);assert.ok(Math.abs(m.favorite.probability-.7)<1e-9);assert.throws(()=>E.applyBbo(m,{marketData:{bestBid:{value:'.9'},bestAsk:{value:'.8'}}}),/crossed/);});
for(const target of [2,3,4,5])test('combo target '+target+'x is reached without fabricated legs',()=>{const q=1/Math.sqrt(target);const ms=[market(1,q),market(2,q),market(3,.9)];const result=E.buildCombos(ms,target);assert.ok(result.length);assert.ok(Math.abs(result[0].multiplier/target-1)<=.15);assert.ok(result[0].legs.length>=2);});
test('same event, same competitor, mixed venue and stale books excluded',()=>{const a=market(1),b=market(2);b.eventId=a.eventId;assert.equal(E.buildCombos([a,b],2).length,0);b.eventId='other';b.outcomes[0].teamId=a.outcomes[0].teamId;assert.equal(E.buildCombos([a,b],2).length,0);b.outcomes[0].teamId='unique';b.venue='international';assert.equal(E.buildCombos([a,b],2).length,0);b.venue='us';b.verifiedAt=Date.now()-100000;assert.equal(E.buildCombos([a,b],2).length,0);});
test('research-required mode returns no unsupported picks',()=>assert.equal(E.buildCombos([market(1),market(2)],2,{requireResearch:true}).length,0));
test('settlement handles LFMP and never assumes a cancelled leg is removed',()=>{const legs=[{slug:'a',selectedLong:true},{slug:'b',selectedLong:false}];assert.deepEqual(E.settlementEstimate(legs,8000,{a:1,b:.4}).payout,4800);assert.equal(E.settlementEstimate(legs,8000,{a:1}),null);assert.equal(E.settlementEstimate(legs,8000,{a:0}).payout,0);assert.equal(E.settlementEstimate([{selection:'a'}],8000,{}),null);});
test('OCR parses labeled amounts without confirming a wager',()=>{const text='Stake $5.00\n3.18x\nPotential payout $15.90';assert.equal(E.ocrFields(text).stake,5);assert.equal(E.ocrFields(text).potential,15.9);assert.equal(E.ocrFields(text).multiplier,3.18);assert.equal(E.ocrFields('unreadable').stake,null);});
test('invalid backup and fractional cents rejected',()=>{const s=E.initialState();assert.equal(E.validateBackup(s),s);s.version=200;assert.throws(()=>E.validateBackup(s));assert.throws(()=>E.deposit(E.initialState(),.1));});
test('pagination increments offset, deduplicates and completes partial final page',async()=>{const api=new MarketAPI();api.sports=[{name:'Tennis',slug:'tennis'}];const paths=[];api.request=async p=>{paths.push(p);return {events:p.includes('offset=0')?Array.from({length:50},(_,i)=>({...event(),id:String(i)})):[{...event(),id:'49'},{...event(),id:'50'}]};};let count=0;const result=await api.scan({onPage:m=>count+=m.length});assert.equal(paths.length,2);assert.ok(paths[1].includes('offset=50'));assert.equal(result.total,51);assert.equal(count,51);assert.equal(result.errors.length,0);});
test('API failure is not reported as an empty successful scan',async()=>{const api=new MarketAPI();api.sports=[{name:'Tennis',slug:'tennis'}];api.request=async()=>{throw new Error('HTTP 503');};const r=await api.scan();assert.equal(r.total,0);assert.equal(r.errors.length,1);});
test('pagination cap is explicit and a repeated page fails',async()=>{const api=new MarketAPI();api.sports=[{name:'Tennis',slug:'tennis'}];api.request=async()=>({events:Array.from({length:50},(_,i)=>({...event(),id:String(i)}))});let r=await api.scan({maxPages:1});assert.deepEqual(r.truncated,['Tennis']);r=await api.scan();assert.match(r.errors[0],/repeated/);});
test('unsupported sport research never invents statistics',async()=>{const r=await new ResearchAPI().research({...market(1),sport:'tennis'});assert.equal(r.available,false);assert.equal(r.supported,false);assert.deepEqual(r.teams,[]);});
test('proxy denies arbitrary URLs, writes and unauthenticated private sync',async()=>{const env={ALLOWED_ORIGIN:'https://example.github.io',APP_TOKEN:'test'};const req=(path,method='GET')=>new Request('https://worker.test'+path,{method,headers:{Origin:env.ALLOWED_ORIGIN}});assert.equal((await worker.fetch(req('/market/v1/orders','POST'),env,{})).status,405);assert.equal((await worker.fetch(req('/market/http://evil.test'),env,{})).status,404);assert.equal((await worker.fetch(req('/sync','POST'),env,{})).status,401);assert.equal((await worker.fetch(new Request('https://worker.test/market/v2/sports'),env,{})).status,403);});

// Captured official US response shapes are kept outside the production module graph.
test('captured US responses cover six sports without hardcoding production games',async()=>{
 const {readFile}=await import('node:fs/promises');
 const data=JSON.parse(await readFile(new URL('./fixtures/us-events.json',import.meta.url),'utf8'));
 for(const {sport,event} of data.samples){
  const rows=E.normalizeEvent(event,sport);assert.ok(rows.length>0,sport.slug);
  assert.ok(rows.every(m=>m.venue==='us'&&m.url.startsWith('https://polymarket.us/')));
  if(sport.slug==='soccer')assert.ok(rows.every(m=>!m.supported));
  else assert.ok(rows.some(m=>m.supported),sport.slug+' full-match winner recognized');
 }
});
test('backup restore rejects unsafe identifiers, URLs and malformed dates',()=>{
 const bad=E.initialState();bad.goals[0].id='x" onclick="alert(1)';assert.throws(()=>E.validateBackup(bad));
 const bad2=E.initialState();bad2.combos=[{id:'valid',url:'javascript:alert(1)'}];assert.throws(()=>E.validateBackup(bad2));
});
test('reported Haile, Marmorstein and Tikhonova matches remain visible awaiting start',async()=>{
 const {readFile}=await import('node:fs/promises');const f=JSON.parse(await readFile(new URL('./fixtures/tennis-awaiting-start.json',import.meta.url),'utf8'));const now=Date.parse(f.observedAt);
 const rows=f.events.flatMap(e=>E.normalizeEvent(e,{slug:'tennis',name:'Tennis'},now));
 assert.equal(rows.length,3);assert.ok(rows.every(m=>m.start<now&&!m.live&&m.open));
 assert.equal(E.filteredMarkets(rows,{sport:'tennis',window:'15'},now).length,3);
 assert.equal(E.filteredMarkets(rows,{sport:'tennis',window:'15',includeAwaiting:false},now).length,0);
 assert.ok(rows.every(m=>E.awaitingStart(m,now)));
 for(const m of rows){m.verifiedAt=now;assert.equal(E.eligibility(m,{now}),null);}
});
test('awaiting-start exception never turns unknown, live, ended, suspended or old events into upcoming games',()=>{
 const now=Date.now(),base={...market(1),start:now-300000,live:false,ended:false,notStarted:true};
 assert.equal(E.awaitingStart(base,now),true);
 for(const patch of [{notStarted:false},{live:true},{ended:true},{suspended:true},{open:false},{start:now-13*3600000}])assert.equal(E.awaitingStart({...base,...patch},now),false,JSON.stringify(patch));
 assert.equal(E.filteredMarkets([{...base,live:true}],{window:'15'},now).length,0);
 assert.equal(E.filteredMarkets([{...base,live:true}],{window:'live'},now).length,1);
 assert.notEqual(E.eligibility({...base,notStarted:false},{now}),null);
});
test('eventState live or ended flags override contradictory top-level pre-match flags',()=>{
 const e={...event(),live:false,ended:false,startTime:new Date(Date.now()-600000).toISOString()};
 e.eventState={live:true,ended:false,period:'S1'};let m=E.normalizeEvent(e)[0];assert.equal(m.live,true);assert.equal(m.notStarted,false);
 e.eventState={live:false,ended:true};m=E.normalizeEvent(e)[0];assert.equal(m.open,false);assert.equal(m.ended,true);
});
test('nearest combo is explicitly outside target and cannot bypass eligibility or correlation checks',()=>{
 const a=market(1,.55),b=market(2,.55);assert.equal(E.buildCombos([a,b],2).length,0);
 const near=E.buildCombos([a,b],2,{allowNearest:true});assert.equal(near.length,1);assert.equal(near[0].targetMatched,false);assert.ok(near[0].multiplier>3);
 b.eventId=a.eventId;assert.equal(E.buildCombos([a,b],2,{allowNearest:true}).length,0);
 b.eventId='different';b.verifiedAt=0;assert.equal(E.buildCombos([a,b],2,{allowNearest:true}).length,0);
});
test('valid target after first twelve candidates is searched',()=>{
 const first=Array.from({length:12},(_,i)=>market('early'+i,.51)),later=[market('late1',.72),market('late2',.7)];later.forEach(m=>m.start+=60000);
 assert.equal(E.buildCombos(first,2).length,0);const result=E.buildCombos([...first,...later],2);assert.ok(result.length);assert.ok(result.every(c=>c.targetMatched));
});
test('diagnostics distinguish research, quote, spread and duplicate eligibility failures',()=>{
 const a=market(1),b=market(2),c=market(3);a.verifiedAt=0;a.bookError='HTTP 503';b.spread=.2;
 const d=E.comboDiagnostics([a,b,c],{requireResearch:true});assert.equal(d.eligible.length,0);assert.equal(Object.values(d.rejected).reduce((a,b)=>a+b,0),3);assert.ok(Object.keys(d.rejected).some(x=>x.includes('503')));assert.equal(d.rejected['Independent research is unavailable'],1);
});
async function uiHarness(api){
 const {readFile}=await import('node:fs/promises');const {runInNewContext}=await import('node:vm');
 const nodes=new Map();const values={'#combo-stake':'5','#max-legs':'6','#max-spread':'8','#min-depth':'0'};
 const document={querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',value:values[selector]||'',checked:false,classList:{add(){},remove(){}},showModal(){},addEventListener(){}});return nodes.get(selector);},addEventListener(){},querySelectorAll:()=>[]};
 const context={SOURCES,sourceKey,sourceLabel,sourceDetails,sourceGroups,E,S:{save:async()=>{},write:async()=>{}},MarketAPI,ResearchAPI,document,window:{addEventListener(){}},location:{hash:'#combos'},console,Date,Intl,Map,Set,Math,Number,String,Array,Object,Promise,AbortController,structuredClone,setTimeout:()=>1,clearTimeout(){}};
 const source=(await readFile(new URL('./app.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/void init\(\);\s*$/,'');
 runInNewContext(source+'\nthis.uiTest={scan,generate,researchPage,betCard,bets,sourceFields,sourceState:s=>state=s,filterSource:key=>betSourceFilter=key,setContext:(a)=>{state=E.initialState();api=a;research={research:async()=>({available:false,supported:false,summary:"Unavailable"})};catalog=[{slug:"tennis",name:"Tennis"},{slug:"basketball",name:"Basketball"}];filters.sport="tennis";filters.window="15";},sport:s=>filters.sport=s,snapshot:()=>({markets,combos,comboFeedback,loadedSport,scanning})};',context);
 context.uiTest.setContext(api);return {ui:context.uiTest,nodes};
}
test('Generate waits for the selected sport second page and reuses the active scan',async()=>{
 let release;const gate=new Promise(r=>release=r);let scans=0,verifications=0;
 const a={...market(1),sport:'tennis'},b={...market(2),sport:'tennis'};
 const api={scan:async({onPage})=>{scans++;onPage([a]);await gate;onPage([b]);return {total:2,errors:[],truncated:[]};},verify:async()=>{verifications++;return [];}};
 const {ui}=await uiHarness(api);const scanning=ui.scan();const generating=ui.generate();
 await new Promise(r=>setImmediate(r));assert.equal(verifications,0,'must not generate from incomplete page');assert.equal(scans,1,'must not abort and restart the scan');
 release();await scanning;await generating;assert.equal(ui.snapshot().markets.length,2);assert.ok(ui.snapshot().combos.length);assert.equal(scans,1);
});
test('late callbacks from cancelled sport scans cannot overwrite the selected sport',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const api={scan:async({sport,onPage})=>{if(sport==='tennis')await gate;onPage([{...market(sport),sport}]);return {total:1,errors:[],truncated:[]};}};
 const {ui}=await uiHarness(api);const old=ui.scan();ui.sport('basketball');await ui.scan();release();await old;
 assert.equal(ui.snapshot().loadedSport,'basketball');assert.deepEqual(Array.from(ui.snapshot().markets,m=>m.sport),['basketball']);
});

test('initial deposit correction preserves wager history, profit and audit trail',()=>{
 const s=E.initialState();E.deposit(s,2500);const b=E.logBet(s,placed());E.settleBet(s,b.id,'won',1500);const before=structuredClone(s.bets),profit=E.metrics(s).profit;
 E.correctInitialDeposit(s,1500);assert.equal(E.metrics(s).deposited,1500);assert.equal(E.metrics(s).bankroll,2500);assert.equal(E.metrics(s).profit,profit);assert.deepEqual(s.bets,before);assert.equal(s.corrections[0].previous,2500);assert.equal(s.corrections[0].amount,1500);E.correctInitialDeposit(s,1500);assert.equal(s.corrections.length,1);assert.throws(()=>E.correctInitialDeposit(s,0));
});
test('cashouts are financial wins, losses or break-even without erasing settlement method',()=>{
 const s=E.initialState();E.deposit(s,5000);
 for(const payout of [700,300,500]){const b=E.logBet(s,placed());E.settleBet(s,b.id,'cashed-out',payout);}
 const m=E.metrics(s);assert.equal(m.won,1);assert.equal(m.lost,1);assert.equal(m.breakEven,1);assert.equal(m.winRate,.5);assert.equal(m.cashedOut,3);assert.equal(m.profit,0);assert.ok(s.bets.every(b=>b.status==='cashed-out'));assert.deepEqual(s.bets.map(E.betResult),['won','lost','break-even']);
});
test('pending stakes are deducted once; gross potential payout never contributes to available cash',()=>{
 const s=E.initialState();E.deposit(s,1500);const b=E.logBet(s,placed());let m=E.metrics(s);assert.equal(m.pendingStake,500);assert.equal(m.bankroll,1000);assert.equal(m.profit,0);assert.equal(E.betResult(b),'pending');E.settleBet(s,b.id,'cashed-out',300);m=E.metrics(s);assert.equal(m.pendingStake,0);assert.equal(m.bankroll,1300);assert.equal(m.profit,-200);assert.equal(m.lost,1);
});
test('wallet snapshots reconcile live cash and positions without changing ledger profit',()=>{
 const s=E.initialState();E.deposit(s,1500);const before=E.metrics(s);
 const w=E.recordWalletSnapshot(s,{available:2949,positions:1847,total:4796,at:'2026-10-28T08:38:00.000Z'});
 assert.equal(E.latestWalletSnapshot(s),w);assert.deepEqual(E.metrics(s),before);assert.throws(()=>E.recordWalletSnapshot(s,{available:2949,positions:1847,total:4700}),/must equal/);
 const copy=structuredClone(s);delete copy.walletSnapshots;assert.deepEqual(E.validateBackup(copy).walletSnapshots,[]);
});
test('pending ticket corrections preserve an audit trail and cannot overspend',()=>{
 const s=E.initialState();E.deposit(s,1500);const b=E.logBet(s,placed());
 E.correctPendingBet(s,b.id,{stake:652,potential:2812,multiplier:2812/652,placedAt:b.placedAt,selections:['Takacs','Gubi','Madarasz']});
 assert.equal(b.stake,652);assert.equal(b.potential,2812);assert.deepEqual(b.legs.map(l=>l.selection),['Takacs','Gubi','Madarasz']);assert.equal(s.corrections[0].previous.stake,500);assert.equal(s.corrections[0].updated.stake,652);assert.throws(()=>E.correctPendingBet(s,b.id,{stake:2000,potential:4000,multiplier:2,placedAt:b.placedAt,selections:['A','B']}),/available/);
 E.settleBet(s,b.id,'won',2812);assert.throws(()=>E.correctPendingBet(s,b.id,{stake:500,potential:1000,multiplier:2,placedAt:b.placedAt,selections:['A','B']}),/pending/);
});
test('Sheets financial classifications match app cashout accounting',async()=>{
 const {readFile}=await import('node:fs/promises'),{runInNewContext}=await import('node:vm');const src=await readFile(new URL('./Sheets.gs',import.meta.url),'utf8');const output={};const props=new Map([['SYNC_SECRET','test'],['SHEET_ID','test']]);const ctx={console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},LockService:{getScriptLock:()=>({waitLock(){},hasLock:()=>true,releaseLock(){}})},SpreadsheetApp:{openById:()=>({}),flush(){}},Utilities:{formatDate:d=>d.toISOString().slice(0,10)},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})}};runInNewContext(src+'\nthis.put=(book,name,headers,rows)=>capture(name,headers,rows);',Object.assign(ctx,{capture:(name,headers,rows)=>output[name]={headers,rows}}));const s=E.initialState();E.deposit(s,2500);for(const payout of [700,300,500]){const b=E.logBet(s,placed());E.settleBet(s,b.id,'cashed-out',payout);}const reply=ctx.doPost({postData:{contents:JSON.stringify({secret:'test',id:'test',revision:1,snapshot:s})}});assert.equal(JSON.parse(reply.text).ok,true);assert.deepEqual(Array.from(output.BETS.rows,r=>r[16]),['win','loss','break-even']);assert.equal(output.PERFORMANCE.rows.find(r=>r[1]==='Win rate (profitable/losing)')[2],.5);
});

test('source attribution retains unknown history and isolates recorded outcomes',()=>{
 assert.equal(sourceKey({source:'edgeboard'}),'edgeboard');
 assert.equal(sourceKey({source:'manual'}),'unknown');
 assert.equal(sourceKey({source:'manual',researchSource:'tennistonic'}),'tennistonic');
 const groups=sourceGroups([{source:'edgeboard',status:'won',stake:500,payout:900},{researchSource:'tennistonic',status:'cashed-out',stake:500,payout:300},{researchSource:'tennistonic',status:'pending',stake:500,payout:0}]);
 assert.deepEqual(groups.find(g=>g.key==='tennistonic'),{key:'tennistonic',label:'TennisTonic',total:2,pending:1,settled:1,profit:-200});
 assert.equal(groups.find(g=>g.key==='edgeboard').profit,400);
});
test('source links require the stated publisher and reject unsafe URLs',()=>{
 assert.equal(sourceDetails('tennistonic','https://tennistonic.com/example').researchUrl,'https://tennistonic.com/example');
 for(const url of ['javascript:alert(1)','https://tennistonic.com.evil.test/a','https://evil.test/?site=tennistonic.com','https://user@tennistonic.com/a','https://www.tennisprediction.com/'])assert.throws(()=>sourceDetails('tennistonic',url));
 assert.throws(()=>sourceDetails('made-up',''));
 assert.equal(sourceDetails('mixed','').researchUrl,'');
});

test('research and My Bets render distinct source records while preserving wallet totals',async()=>{
 const {ui}=await uiHarness({});
 const s=E.initialState();E.deposit(s,2000);
 const a=E.logBet(s,{...placed(),source:'edgeboard'});
 const b=E.logBet(s,{...placed(),source:'manual',researchSource:'tennistonic',researchUrl:'https://tennistonic.com/article'});
 E.settleBet(s,b.id,'cashed-out',300);ui.sourceState(s);
 assert.match(ui.researchPage(),/TennisTonic/);assert.match(ui.researchPage(),/TennisPrediction/);
 assert.match(ui.betCard(b),/SOURCE: TennisTonic/);
 ui.filterSource('tennistonic');const html=ui.bets();
 assert.match(html,/Showing 1 tickets/);assert.match(html,/Pending · 0/);assert.match(html,/Settled · 1/);
 assert.ok(!html.includes('data-id="'+a.id+'"'));assert.match(html,/\$13\.00/);
 const {csv}=await import('./store.js');assert.match(csv([b]),/"Research source","Source URL"/);
 assert.match(csv([b]),/"TennisTonic","https:\/\/tennistonic.com\/article"/);
});
