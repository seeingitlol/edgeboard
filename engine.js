/* Pure, dependency-free domain logic. Money is stored as integer cents. */
export const VERSION = 1;
export const cents = value => { const n = Number(value); if(!Number.isFinite(n)) throw new Error('Enter a valid amount.'); return Math.round(n * 100); };
export const uid = () => crypto.randomUUID();
export const iso = () => new Date().toISOString();
export const amount = value => { if(value === null || value === undefined || value === '') return null; const n=Number(typeof value==='object'?value.value:value); return Number.isFinite(n)?n:null; };
export const prob = value => {const n=amount(value); return n!==null && n>0 && n<1?n:null;};
export const initialState = () => ({version:VERSION,revision:0,settings:{stake:500,riskPercent:20,dailyLoss:1000,lowBalance:500,cashoutAt:10000,cashoutAmount:5000,overallGoal:500000,proxy:'',sheetsUrl:'',notifications:false,maxPages:20,maxLegs:6,requireResearch:false,minDepth:0,maxSpread:.08},bets:[],cash:[],combos:[],branches:[],transfers:[],goals:[{id:'big-bear',name:'Big Bear trip',target:120000},{id:'iphone',name:'New iPhone',target:120000},{id:'shopping',name:'Shopping & food',target:80000}],incoming:{id:'nov-payment',expected:90000,due:'2026-11-05T08:00:00Z',received:0,receivedAt:null},outbox:[],syncAt:null});
export function metrics(s){
 const settled=s.bets.filter(b=>b.status!=='pending'), resolved=settled.filter(b=>['won','lost'].includes(b.status));
 const staked=s.bets.reduce((a,b)=>a+b.stake,0), payouts=settled.reduce((a,b)=>a+b.payout,0), settledStake=settled.reduce((a,b)=>a+b.stake,0);
 const deposited=s.cash.filter(x=>x.kind==='deposit').reduce((a,b)=>a+b.amount,0),withdrawn=s.cash.filter(x=>x.kind==='withdrawal').reduce((a,b)=>a+b.amount,0);
 const bankroll=deposited-withdrawn-staked+payouts, reserved=s.branches.filter(b=>b.status==='ready').reduce((a,b)=>a+b.stake,0);
 let run=0,bestWin=0,bestLoss=0; for(const b of [...resolved].sort((a,b)=>a.settledAt.localeCompare(b.settledAt))){run=b.status==='won'?(run>0?run+1:1):(run<0?run-1:-1);bestWin=Math.max(bestWin,run);bestLoss=Math.max(bestLoss,-run);}
 return {bankroll,available:bankroll-reserved,reserved,deposited,withdrawn,staked,payouts,profit:payouts-settledStake,settledStake,losses:settled.reduce((a,b)=>a+Math.max(0,b.stake-b.payout),0),won:resolved.filter(b=>b.status==='won').length,lost:resolved.filter(b=>b.status==='lost').length,pending:s.bets.filter(b=>b.status==='pending').length,cashedOut:settled.filter(b=>b.status==='cashed-out').length,roi:settledStake?(payouts-settledStake)/settledStake:null,winRate:resolved.length?resolved.filter(b=>b.status==='won').length/resolved.length:null,run,bestWin,bestLoss};
}
function positive(n,label){if(!Number.isSafeInteger(n)||n<=0)throw new Error(`${label} must be a positive amount in cents.`);}
export function deposit(s,n){positive(n,'Deposit');s.cash.push({id:uid(),at:iso(),kind:'deposit',amount:n});}
export function logBet(s,input){
 positive(input.stake,'Stake');if(!Number.isFinite(input.multiplier)||input.multiplier<1)throw new Error('Enter the accepted multiplier.');
 if(!Array.isArray(input.legs)||input.legs.length<2)throw new Error('A combo needs at least two confirmed selections.');
 if(input.legs.some(l=>!l.selection?.trim()))throw new Error('Enter each selected player or team.');
 if(input.ticketId && s.bets.some(b=>b.ticketId===input.ticketId))throw new Error('That ticket ID is already recorded.');
 if(input.screenshotHash && s.bets.some(b=>b.screenshotHash===input.screenshotHash))throw new Error('This screenshot is already attached to a wager.');
 const branch=input.branchId?s.branches.find(b=>b.id===input.branchId):null;
 if(input.branchId && (!branch||branch.status!=='ready'||branch.stake!==input.stake))throw new Error('Select a ready branch with this exact stake.');
 if(input.stake>metrics(s).available+(branch?.stake||0))throw new Error('Insufficient confirmed funds. Record an actual deposit first.');
 if(!Number.isFinite(Date.parse(input.placedAt)))throw new Error('Enter a valid placement date.');
 positive(input.potential,'Potential payout');
 const b={...input,id:uid(),status:'pending',payout:0,settledAt:null,source:input.source||'manual',at:iso()};
 s.bets.push(b);if(branch){branch.status='pending';branch.betId=b.id;}
 if(input.comboId){const c=s.combos.find(c=>c.id===input.comboId);if(c)c.placed=true;}
 return b;
}
export function settleBet(s,id,status,payout){
 const b=s.bets.find(x=>x.id===id);if(!b)throw new Error('Wager not found.');
 if(b.status!=='pending')throw new Error('Already settled. Export your records before correcting a receipt.');
 if(!['won','lost','cashed-out','voided'].includes(status))throw new Error('Select a settlement status.');
 if(!Number.isSafeInteger(payout)||payout<0||(status==='lost'&&payout!==0))throw new Error('Invalid received payout. A lost wager returns $0.');
 b.status=status;b.payout=payout;b.settledAt=iso();
 const br=s.branches.find(x=>x.betId===id);if(br){br.status=status;br.payout=payout;}
 return b;
}
export function startBranch(s,stake){positive(stake,'Branch stake');if(stake>metrics(s).available)throw new Error('Not enough available funds.');const b={id:uid(),parent:null,level:1,stake,status:'ready',payout:0};s.branches.push(b);return b;}
export function splitBranch(s,id,allocations,maxLevels=10){
 const parent=s.branches.find(b=>b.id===id);if(!parent||!['won','cashed-out','voided'].includes(parent.status))throw new Error('Only received payouts can fund branches.');
 if(parent.split)throw new Error('This branch has already been allocated.');if(parent.level>=maxLevels)throw new Error('Configured branch depth reached.');
 if(!allocations.length)throw new Error('Add an allocation.');allocations.forEach(a=>positive(a,'Allocation'));
 const total=allocations.reduce((a,b)=>a+b,0);if(total>parent.payout||total>metrics(s).available)throw new Error('Allocation exceeds received or available funds.');
 parent.split=true;parent.carried=total;return allocations.map(stake=>{const b={id:uid(),parent:id,level:parent.level+1,stake,status:'ready',payout:0};s.branches.push(b);return b;});
}
export function cancelBranch(s,id){const b=s.branches.find(x=>x.id===id);if(!b||b.status!=='ready')throw new Error('Only ready funds can be released.');b.status='released';}
export function receiveIncoming(s,n){positive(n,'Received payment');if(s.incoming.receivedAt)throw new Error('Payment already received.');s.incoming.received=n;s.incoming.receivedAt=iso();s.transfers.push({id:uid(),kind:'incoming',amount:n,at:iso()});}
export const goalSaved=(s,id)=>s.transfers.filter(t=>t.goalId===id).reduce((a,b)=>a+b.amount,0);
export const totalSaved=s=>s.goals.reduce((a,g)=>a+goalSaved(s,g.id),0);
export function allocate(s,goalId,n,source){
 positive(n,'Allocation');if(!s.goals.some(g=>g.id===goalId))throw new Error('Goal not found.');
 if(source==='incoming') {const used=s.transfers.filter(t=>t.kind==='allocation'&&t.source==='incoming').reduce((a,b)=>a+b.amount,0);if(n>s.incoming.received-used)throw new Error('Allocation exceeds the payment actually received.');}
 else if(source==='bankroll'){if(n>metrics(s).available)throw new Error('Withdrawal exceeds available bankroll.');s.cash.push({id:uid(),at:iso(),kind:'withdrawal',amount:n});}
 else throw new Error('Choose a funding source.');
 s.transfers.push({id:uid(),at:iso(),kind:'allocation',goalId,amount:n,source});
}
const fullWinner=new Set(['moneyline','tennis_match_winner','table_tennis_match_winner','match_winner','esports_match_winner','mma_match_winner','soccer_game_to_advance','fight_winner','basketball_team_full_game_winner','football_team_full_game_winner','baseball_team_full_game_winner','hockey_team_full_game_winner']);
export function normalizeEvent(e,sport,at=Date.now()){
 const tag=e.primaryTag||{}, group=(e.tags||[]).find(t=>t.sport)?.sport;
 const sp=sport||group||tag.sport||{slug:'other',name:'Other'};
 const start=e.startTime||e.startDate; const stamp=Date.parse(start); const results=[];
 for(const m of e.markets||[]){
  const sides=m.marketSides||[];const names=sides.map(x=>x.description||x.team?.name||'Unknown');
  const type=m.sportsMarketType||m.marketType||'';
  const supported=fullWinner.has(type)&&sides.length===2&&sides.every(x=>typeof x.long==='boolean'&&x.teamId!=null)&&sides[0].long!==sides[1].long&&!names.some(x=>/^(yes|no|draw|tie)$/i.test(x));
  // Raw MarketSide.price/outcomePrices are NOT complementary outcome probabilities in US.
  const bid=prob(m.bestBidQuote),ask=prob(m.bestAskQuote);const mid=bid!==null&&ask!==null&&bid<=ask?(bid+ask)/2:null;
  const outcomes=sides.map(x=>({name:x.description||x.team?.name||'Unknown',teamId:String(x.teamId??''),long:x.long,probability:mid===null?null:x.long?mid:1-mid,quote:prob(x.quote),tradable:x.tradable===true}));
  const favorite=outcomes.length===2&&outcomes.every(o=>o.probability!==null)?outcomes.reduce((a,b)=>a.probability>=b.probability?a:b):null;
  const period=e.period||e.eventState?.period||'';
  const suspended=/SUS|POSTP|CANCEL|DELAY/i.test(period);
  const live=e.live===true||e.eventState?.live===true;
  const ended=e.ended===true||e.eventState?.ended===true;
  const notStarted=e.live===false&&e.ended===false&&!live&&!ended&&/^(NS|NOT_STARTED|SCHEDULED)?$/i.test(period);
  const open=m.status==='MARKET_STATUS_OPEN'&&m.active===true&&m.closed===false&&e.closed!==true&&!ended&&!suspended;
  results.push({id:String(m.id),eventId:String(e.id),slug:m.slug,eventSlug:e.slug,title:e.title,sport:sp.slug,sportName:sp.name,league:e.eventState?.tennisState?.tournamentName||tag.league?.name||e.seriesSlug||sp.name,start:Number.isFinite(stamp)?stamp:null,live:live&&!ended&&!suspended,ended,notStarted,suspended,open,status:suspended?'Suspended':m.status?.replace('MARKET_STATUS_','')||'Unknown',type,supported,outcomes,favorite,spread:mid===null?null:ask-bid,liquidity:null,depth:null,comboEnabled:m.comboEnabled===true,verifiedAt:0,fetchedAt:at,venue:'us',url:`https://polymarket.us/event/${encodeURIComponent(e.slug)}`,research:null});
 }
 return results;
}
export function applyBbo(m,response,at=Date.now()){
 const b=response.marketData;if(!b)throw new Error('Invalid order-book response.');
 const bid=prob(b.bestBid),ask=prob(b.bestAsk); if(bid===null||ask===null||bid>ask)throw new Error('Missing or crossed bid/ask.');
 const mid=(bid+ask)/2;
 m.outcomes=m.outcomes.map(o=>({...o,probability:o.long?mid:1-mid,quote:prob(o.long?b.longQuote:b.shortQuote)}));
 m.favorite=m.outcomes.reduce((a,b)=>a.probability>=b.probability?a:b);
 m.spread=ask-bid;m.depth={bid:amount(b.bidShares),ask:amount(b.askShares)};m.liquidity=null;
 m.open=m.open&&b.state==='MARKET_STATE_OPEN';m.verifiedAt=at;m.bookState=b.state;return m;
}
// Tennis schedules slip. A past timestamp alone is not evidence that play started.
// These remain separately labeled; never invent a replacement scheduled start.
export function awaitingStart(m,now=Date.now()){
 return m.open&&!m.live&&!m.ended&&!m.suspended&&m.notStarted===true&&Number.isFinite(m.start)&&m.start<=now&&now-m.start<=12*3600000;
}
export function marketTimeOrder(a,b,now=Date.now()){
 const rank=m=>awaitingStart(m,now)?Math.abs(m.start-now):m.start===null?Infinity:Math.max(0,m.start-now);
 return rank(a)-rank(b)||String(a.id).localeCompare(String(b.id));
}
export function filteredMarkets(markets,{sport='all',window='180',search='',lopsided=false,min=.75,max=.88,includeAwaiting=true}={},now=Date.now()){
 return markets.filter(m=>m.open&&(sport==='all'||m.sport===sport||m.league===sport)&&(!search||`${m.title} ${m.outcomes.map(o=>o.name).join(' ')}`.toLowerCase().includes(search.toLowerCase()))&&(window==='live'?m.live:!m.live&&m.start!==null&&((m.start>=now&&(window==='all'||m.start<=now+Number(window)*60000))||(includeAwaiting&&awaitingStart(m,now))))&&(!lopsided||(m.favorite&&m.favorite.probability>=min&&m.favorite.probability<=max))).sort((a,b)=>marketTimeOrder(a,b,now));
}
export function eligibility(m,{now=Date.now(),maxSpread=.08,minDepth=0,requireResearch=false}={}){
 if(!m.supported)return 'Not a verified two-competitor full-match winner market';
 if(!m.open)return 'Market is not open';if(!m.comboEnabled)return 'Native combo eligibility is not confirmed';
 if(m.start===null||(!m.live&&m.start<=now&&!awaitingStart(m,now)))return 'Start time missing, stale, or start status unconfirmed';
 if(!m.verifiedAt||now-m.verifiedAt>90000)return m.bookError?'Order book unavailable: '+m.bookError:'Order book needs refreshing';
 if(m.spread===null||m.spread>maxSpread)return 'Spread exceeds filter';
 if(!m.favorite?.quote||m.outcomes.some(o=>!o.tradable))return 'Missing tradable quote';
 if(minDepth>0&&(m.depth?.bid==null||m.depth?.ask==null||Math.min(m.depth.bid,m.depth.ask)<minDepth))return 'Order-book depth below filter';
 if(requireResearch&&!m.research?.supported)return 'Independent research is unavailable';return null;
}
export function comboDiagnostics(markets,options={}){
 const rejected={},eligible=[];
 for(const m of markets){const reason=eligibility(m,options);if(reason)rejected[reason]=(rejected[reason]||0)+1;else eligible.push(m);}
 return {total:markets.length,eligible,rejected};
}
export function buildCombos(markets,target,options={}){
 if(![2,3,4,5].includes(Number(target)))throw new Error('Choose a 2×–5× target.');
 const maxLegs=Math.min(6,Math.max(2,options.maxLegs||6)),now=options.now||Date.now();
 const candidates=markets.filter(m=>!eligibility(m,options)).sort((a,b)=>Number(!!b.research?.supported)-Number(!!a.research?.supported)||marketTimeOrder(a,b,now)).slice(0,40);
 let beam=[{legs:[],product:1,events:[],teams:[],score:0}]; const found=[],nearest=[];
 for(const m of candidates){
  const newStates=[];
  for(const c of beam){if(c.legs.length>=maxLegs||c.events.includes(m.eventId)||m.outcomes.some(o=>c.teams.includes(o.teamId))||c.legs.some(l=>l.venue!==m.venue))continue;
   const product=c.product/m.favorite.quote;
   const q={legs:[...c.legs,m],product,events:[...c.events,m.eventId],teams:[...c.teams,...m.outcomes.map(o=>o.teamId)],score:0};
   q.score=Math.abs(Math.log(product/target))+.012*q.legs.length+.02*q.legs.filter(x=>!x.research?.supported).length;
   if(q.legs.length>=2){nearest.push(q);if(Math.abs(product/target-1)<=.15)found.push(q);}
   // Once over target, adding legs can only increase the multiplier. Retain the
   // complete ticket as a labeled nearest alternative, but stop extending it.
   if(product<=target*1.15)newStates.push(q);
  }
  beam=[...beam,...newStates].sort((a,b)=>a.score-b.score).slice(0,700);
 }
 const source=found.length?found:options.allowNearest?nearest:[];
 const seen=new Set();return source.sort((a,b)=>a.score-b.score).filter(c=>{const k=c.legs.map(x=>x.id).sort().join('|');if(seen.has(k))return false;seen.add(k);return true;}).slice(0,3).map(c=>({id:uid(),at:iso(),target:Number(target),targetMatched:Math.abs(c.product/target-1)<=.15,multiplier:c.product,implied:c.legs.reduce((p,m)=>p*m.favorite.probability,1),legs:c.legs.map(m=>({...m,selection:m.favorite.name,selectedLong:m.favorite.long,quote:m.favorite.quote})),placed:false}));
}
export function ocrFields(text){
 const get=re=>{const m=text.match(re);return m?Number(m[1].replace(/,/g,'')):null;};
 return {stake:get(/(?:stake|wager|cost|amount paid)\s*[:\n]?\s*\$?([\d,]+(?:\.\d{1,2})?)/i),potential:get(/(?:potential payout|to win|payout|potential return)\s*[:\n]?\s*\$?([\d,]+(?:\.\d{1,2})?)/i),multiplier:get(/(\d+(?:\.\d+)?)\s*[×x]/i),text,statusHint:/\bwon\b/i.test(text)?'won':/\blost\b/i.test(text)?'lost':null};
}
export function settlementEstimate(legs,potential,settlements){
 if(!legs.length||legs.some(l=>!l.slug||typeof l.selectedLong!=='boolean'))return null;
 const values=legs.map(l=>{const p=settlements[l.slug];return Number.isFinite(p)&&p>=0&&p<=1?(l.selectedLong?p:1-p):null;});
 if(values.includes(0))return {status:'lost',payout:0,values};
 if(values.includes(null))return null;
 return {status:values.every(v=>v===1)?'won':'voided',payout:Math.round(potential*values.reduce((a,b)=>a*b,1)),values};
}
export function validateBackup(s){
 if(!s||s.version!==VERSION)throw new Error('Unsupported backup version.');
 for(const key of ['bets','cash','goals','combos','transfers','branches'])if(!Array.isArray(s[key]))throw new Error('Invalid backup: '+key);
 const check=(value,key='')=>{if(value==null)return;if(Array.isArray(value)){value.forEach(v=>check(v,key));return;}if(typeof value==='object'){Object.entries(value).forEach(([k,v])=>check(v,k));return;}if(typeof value==='string'){if(['id','parent','betId','branchId','goalId','comboId'].includes(key)&&value&&!/^[a-zA-Z0-9_.:-]{1,200}$/.test(value))throw new Error('Invalid identifier in backup.');if(['url','source'].includes(key)&&/[:/]/.test(value)){let u;try{u=new URL(value);}catch{throw new Error('Invalid source URL.');}if(u.protocol!=='https:')throw new Error('Source URLs must use HTTPS.');}}};check(s);
 const ids=new Set();for(const b of s.bets){if(!b.id||ids.has(b.id)||!Number.isSafeInteger(b.stake)||b.stake<=0||!Number.isSafeInteger(b.payout)||b.payout<0||!['pending','won','lost','cashed-out','voided'].includes(b.status)||!Array.isArray(b.legs)||!b.placedAt)throw new Error('Invalid wager in backup.');ids.add(b.id);if(!Number.isFinite(Date.parse(b.placedAt))||(b.status!=='pending'&&!Number.isFinite(Date.parse(b.settledAt)))||!Number.isFinite(b.multiplier)||b.multiplier<1||b.legs.length<2)throw new Error('Invalid wager dates or odds.');if(b.status==='pending'&&b.payout!==0)throw new Error('Pending payout cannot be received.');}
 for(const x of s.cash){positive(x.amount,'Cash entry');if(!['deposit','withdrawal'].includes(x.kind))throw new Error('Invalid cash entry.');}
 for(const g of s.goals)positive(g.target,'Goal target');
 for(const t of s.transfers)positive(t.amount,'Transfer');
 for(const b of s.branches){positive(b.stake,'Branch');if(!Number.isInteger(b.level)||b.level<1||b.level>50||!Number.isSafeInteger(b.payout)||b.payout<0)throw new Error('Invalid branch.');}
 if(!s.settings||!s.incoming)throw new Error('Incomplete backup.');
 if(!Number.isSafeInteger(s.incoming.received)||s.incoming.received<0)throw new Error('Invalid received payment.');
 return s;
}
