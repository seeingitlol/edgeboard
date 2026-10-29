export const SOURCES=Object.freeze({edgeboard:'Edgeboard · market-based',tennistonic:'TennisTonic',tennisprediction:'TennisPrediction',mixed:'Multiple sources',unknown:'Unspecified / manual'});
export function sourceKey(b){return Object.hasOwn(SOURCES,b.researchSource)?b.researchSource:b.source==='edgeboard'?'edgeboard':'unknown';}
export const sourceLabel=b=>SOURCES[sourceKey(b)];
export function sourceDetails(key,link=''){
 if(!Object.hasOwn(SOURCES,key))throw new Error('Choose a research source.');
 const raw=String(link).trim();if(!raw)return {researchSource:key,researchUrl:''};
 let u;try{u=new URL(raw);}catch{throw new Error('Enter a full source link.');}
 const hosts={tennistonic:['tennistonic.com','www.tennistonic.com'],tennisprediction:['tennisprediction.com','www.tennisprediction.com']};
 if(u.protocol!=='https:'||u.username||u.password||u.port)throw new Error('Use a public HTTPS source link.');
 if(!hosts[key]?.includes(u.hostname))throw new Error('The link must belong to the selected tennis website. For multiple sources, leave this field blank.');
 return {researchSource:key,researchUrl:u.href};
}
export function sourceGroups(bets){return Object.entries(SOURCES).map(([key,label])=>{const items=bets.filter(b=>sourceKey(b)===key),settled=items.filter(b=>b.status!=='pending');return {key,label,total:items.length,pending:items.length-settled.length,settled:settled.length,profit:settled.reduce((n,b)=>n+b.payout-b.stake,0)};});}
