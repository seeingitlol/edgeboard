/* Optional Cloudflare Worker. Secrets belong in Worker settings, never this file. */
const allowedMarket=/^\/(v2\/sports(?:\/[a-z0-9-]+\/events)?|v1\/markets\/[a-zA-Z0-9_-]+\/(bbo|settlement))$/;
const allowedResearch=/^\/(searchteams|eventslast)\.php$/;
const json=(body,status,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
export default {async fetch(request,env,ctx){
 const url=new URL(request.url),origin=request.headers.get('Origin'),expected=env.ALLOWED_ORIGIN;
 if(!expected||origin!==expected)return json({error:'Origin not allowed'},403);
 const cors={'Access-Control-Allow-Origin':expected,'Vary':'Origin','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 try{
  if(url.pathname==='/sync'){
   if(request.method!=='POST')return json({error:'Method not allowed'},405,cors);
   if(!env.APP_TOKEN||request.headers.get('Authorization')!=='Bearer '+env.APP_TOKEN)return json({error:'Unlock sync with the correct passphrase.'},401,cors);
   if(!env.GAS_URL||!env.GAS_SECRET)return json({error:'Sheets backend not configured'},503,cors);
   const body=await request.text();if(body.length>1500000)return json({error:'Sync payload too large'},413,cors);
   const payload=JSON.parse(body);if(!payload.id||!payload.snapshot||!Number.isSafeInteger(payload.revision))return json({error:'Invalid sync payload'},400,cors);
   const upstream=await fetch(env.GAS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,secret:env.GAS_SECRET}),redirect:'follow',signal:AbortSignal.timeout(22000)});
   const result=await upstream.json();return json(result,result.ok?200:409,cors);
  }
  if(request.method!=='GET')return json({error:'Read-only endpoint'},405,cors);
  let upstream,ttl;
  if(url.pathname.startsWith('/market/')){const path=url.pathname.slice(7);if(!allowedMarket.test(path))return json({error:'Market route not allowed'},404,cors);upstream=new URL('https://gateway.polymarket.us'+path);for(const key of ['limit','offset','type'])if(url.searchParams.has(key))upstream.searchParams.set(key,url.searchParams.get(key));ttl=path.endsWith('/bbo')?10:30;}
  else if(url.pathname.startsWith('/research/')){const path=url.pathname.slice(9);if(!allowedResearch.test(path))return json({error:'Research route not allowed'},404,cors);upstream=new URL('https://www.thesportsdb.com/api/v1/json/123'+path);for(const key of ['t','id'])if(url.searchParams.has(key))upstream.searchParams.set(key,url.searchParams.get(key));ttl=3600;}
  else return json({error:'Not found'},404,cors);
  const key=new Request(upstream.toString(),{method:'GET'}),cache=caches.default;let response=await cache.match(key);
  if(!response){const r=await fetch(upstream,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});response=new Response(r.body,{status:r.status,headers:{'Content-Type':'application/json','Cache-Control':r.ok?`public, max-age=${ttl}`:'no-store'}});if(r.ok)ctx.waitUntil(cache.put(key,response.clone()));}
  const out=new Response(response.body,response);Object.entries(cors).forEach(([k,v])=>out.headers.set(k,v));return out;
 }catch(e){return json({error:e.name==='TimeoutError'?'Upstream timed out':'Integration request failed'},502,cors);}
}};
