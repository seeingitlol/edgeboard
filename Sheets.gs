/** Edgeboard private ledger receiver. See SETUP.md. */
const TABS=['BETS','COMBO HISTORY','BANKROLL','PERFORMANCE','GOALS','TRANSFERS'];
function setup(){
 const p=PropertiesService.getScriptProperties();
 let id=p.getProperty('SHEET_ID');
 if(!id){const book=SpreadsheetApp.create('Edgeboard — Private Ledger');id=book.getId();p.setProperty('SHEET_ID',id);}
 const book=SpreadsheetApp.openById(id);
 TABS.forEach(name=>{if(!book.getSheetByName(name))book.insertSheet(name);});
 console.log('Private ledger: '+book.getUrl());
}
function doPost(e){
 const lock=LockService.getScriptLock();
 try{
  const body=JSON.parse(e.postData.contents),p=PropertiesService.getScriptProperties();
  if(!p.getProperty('SYNC_SECRET')||body.secret!==p.getProperty('SYNC_SECRET'))throw new Error('Unauthorized');
  if(!body.id||!Number.isSafeInteger(body.revision)||!body.snapshot||body.snapshot.version!==1)throw new Error('Invalid payload');
  lock.waitLock(25000);
  const last=p.getProperty('LAST_OP');if(last===body.id)return response({ok:true,ack:body.id});
  const revision=Number(p.getProperty('REVISION')||0);if(body.revision<=revision)throw new Error('Remote ledger is newer. Use your primary device; reconcile before overwriting.');
  const s=body.snapshot;['bets','cash','goals','transfers','combos','branches'].forEach(k=>{if(!Array.isArray(s[k]))throw new Error('Invalid snapshot '+k);});
  const book=SpreadsheetApp.openById(p.getProperty('SHEET_ID'));
  const completed=s.bets.filter(b=>b.status!=='pending'),staked=s.bets.reduce((a,b)=>a+b.stake,0),received=completed.reduce((a,b)=>a+b.payout,0),settledStake=completed.reduce((a,b)=>a+b.stake,0),deposits=s.cash.filter(c=>c.kind==='deposit').reduce((a,b)=>a+b.amount,0),withdrawals=s.cash.filter(c=>c.kind==='withdrawal').reduce((a,b)=>a+b.amount,0);
  put(book,'BETS',['ID','Placed','Selections','Sports','Legs JSON','Stake USD','Accepted multiplier','Potential USD','Status','Received USD','Realized PL USD','Settled','Ticket ID','Staking branch','Target','Source'],s.bets.map(b=>[b.id,b.placedAt,b.legs.map(l=>l.selection).join(' | '),[...new Set(b.legs.map(l=>l.sportName||l.sport))].join(' / '),JSON.stringify(b.legs.map(l=>({selection:l.selection,marketId:l.id,slug:l.slug,long:l.selectedLong}))),b.stake/100,b.multiplier,b.potential/100,b.status,b.payout/100,b.status==='pending'?'':(b.payout-b.stake)/100,b.settledAt||'',b.ticketId||'',b.branchId||'',b.target||'',b.source]));
  put(book,'COMBO HISTORY',['ID','Created','Target','Reference multiplier','Market implied independence approximation','Selections','Research and quote snapshot JSON','Placed'],s.combos.map(c=>[c.id,c.at,c.target,c.multiplier,c.implied,c.legs.map(l=>l.selection).join(' | '),JSON.stringify(c.legs),c.placed]));
  let balance=0;const timeline=[...s.cash.map(c=>({id:c.id,at:c.at,kind:c.kind,change:c.kind==='deposit'?c.amount:-c.amount,returned:'',profit:''})),...s.bets.flatMap(b=>[{id:b.id+':stake',at:b.placedAt,kind:'wager',change:-b.stake,returned:'',profit:''},...(b.status==='pending'?[]:[{id:b.id+':payout',at:b.settledAt,kind:b.status,change:b.payout,returned:Math.min(b.stake,b.payout)/100,profit:(b.payout-b.stake)/100}])])].sort((a,b)=>a.at.localeCompare(b.at));
  put(book,'BANKROLL',['ID','Time','Type','Change USD','Returned stake USD','Realized PL USD','Ending balance USD'],timeline.map(x=>{balance+=x.change;return[x.id,x.at,x.kind,x.change/100,x.returned,x.profit,balance/100];}));
  const won=completed.filter(b=>b.status==='won').length,lost=completed.filter(b=>b.status==='lost').length;
  const perf=[['TOTAL','Bankroll USD',(deposits-withdrawals-staked+received)/100],['TOTAL','Gross payouts USD',received/100],['TOTAL','Realized PL USD',(received-settledStake)/100],['TOTAL','ROI',settledStake?(received-settledStake)/settledStake:''],['TOTAL','Win rate (won/lost)',won+lost?won/(won+lost):'']];
  const groups={};completed.forEach(b=>{const d=new Date(b.settledAt),day=Utilities.formatDate(d,'America/Los_Angeles','yyyy-MM-dd');const weekDate=new Date(day+'T12:00:00Z');weekDate.setUTCDate(weekDate.getUTCDate()-((weekDate.getUTCDay()+6)%7));const week=weekDate.toISOString().slice(0,10);const keys=['Sport: '+[...new Set(b.legs.map(l=>l.sportName||l.sport||'Unknown'))].join(' / '),'Target: '+(b.target||'Manual'),'Legs: '+b.legs.length,'Week: '+week];keys.forEach(k=>{const g=groups[k]||(groups[k]={n:0,w:0,pl:0,stake:0});g.n++;g.w+=b.status==='won'?1:0;g.pl+=b.payout-b.stake;g.stake+=b.stake;});});
  Object.keys(groups).forEach(k=>{const g=groups[k];perf.push([k,'Settled tickets',g.n],[k,'Win rate (all settled)',g.w/g.n],[k,'Realized PL USD',g.pl/100],[k,'ROI',g.pl/g.stake]);});
  put(book,'PERFORMANCE',['Group','Metric','Value'],perf);
  put(book,'GOALS',['ID','Name','Target USD','Confirmed saved USD'],s.goals.map(g=>[g.id,g.name,g.target/100,s.transfers.filter(t=>t.goalId===g.id).reduce((a,t)=>a+t.amount,0)/100]).concat([['overall','Overall aspirational target',s.settings.overallGoal/100,s.transfers.filter(t=>t.kind==='allocation').reduce((a,t)=>a+t.amount,0)/100],['expected-payment',s.incoming.receivedAt?'Received crypto payment':'INCOMING — NOT RECEIVED',s.incoming.expected/100,s.incoming.received/100]]));
  put(book,'TRANSFERS',['ID','Time','Kind','Goal','Amount USD','Source'],s.transfers.map(t=>[t.id,t.at,t.kind,t.goalId||'',t.amount/100,t.source||'External payment']));
  SpreadsheetApp.flush();p.setProperty('REVISION',String(body.revision));p.setProperty('LAST_OP',body.id);
  return response({ok:true,ack:body.id,revision:body.revision});
 }catch(err){return response({ok:false,error:err.message});}finally{if(lock.hasLock())lock.releaseLock();}
}
function put(book,name,headers,rows){
 const sheet=book.getSheetByName(name)||book.insertSheet(name);
 // A confirmed snapshot rebuild is deterministic; IDs cannot create duplicate rows.
 const safe=v=>typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v??'';
 const values=[headers,...rows].map(row=>row.map(v=>safe(typeof v==='string'?v.slice(0,49000):v)));
 if(sheet.getMaxRows()<values.length)sheet.insertRowsAfter(sheet.getMaxRows(),values.length-sheet.getMaxRows());
 if(sheet.getMaxColumns()<headers.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length-sheet.getMaxColumns());
 sheet.getRange(1,1,values.length,headers.length).setValues(values);
 if(sheet.getLastRow()>values.length)sheet.getRange(values.length+1,1,sheet.getLastRow()-values.length,headers.length).clearContent();
 sheet.setFrozenRows(1);sheet.getRange(1,1,1,headers.length).setBackground('#f1f3f4').setFontColor('#202124').setFontWeight('bold');
}
function response(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
