'use strict';
// Kick Arena – autoritativer Realtime-Server (ohne Abhängigkeiten): node server.js  (PORT per Umgebungsvariable)
// Liefert index.html aus und spricht WebSocket (RFC 6455). Die Match-Simulation ist exakt der Code aus index.html.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=+process.env.PORT||8080,HTML=fs.readFileSync(path.join(__dirname,'index.html')),src=HTML.toString('utf8');
const cut=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b));
const L=30,W=18,GW=3.6,GH=2.4,BR=.35,cl=(v,a,b)=>Math.min(b,Math.max(a,+v||0)),wrap=a=>((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
const Sim=new Function('cl','wrap','L','W','GW','GH','BR',`let M=null,P=[],G=[],B={x:0,y:BR,z:0,vx:0,vy:0,vz:0,own:-1,sp:0};
${cut('function mkP(','function applySnap')}
${cut('/* --- host simulation --- */','/* --- client smoothing')}
function init(r,tl){M={sc:[0,0],ph:'cd',ct:3,ot:0,gl:0,q:0,kc:0,ks:0,tl,dead:0};P=r.map(mkP);G=[0,1].map(mkG);place()}
function inp(j,d){if(!P[j]||P[j].bot||!d)return;P[j].i={x:cl(d.x,-1.5,1.5),z:cl(d.z,-1.5,1.5),s:d.s?1:0,sh:d.sh|0,pw:cl(d.pw,0,1),p:d.p|0,t:d.t|0,k:d.k|0,ax:cl(d.ax,-1.5,1.5),az:cl(d.az,-1.5,1.5),fs:d.fs?1:0,m:d.m?1:0,tx:cl(d.tx,-L-3,L+3),tz:cl(d.tz,-W-3,W+3),ty:cl(d.ty,0,8),rq:d.rq?1:0}}
function bot1(j){if(P[j])P[j].bot=1}
return{init,sim,snap,inp,bot1,ph:()=>M.ph,P:()=>P,B:()=>B,M:()=>M,G:()=>G}`);
/* ---------- Räume ---------- */
const rooms=new Map(),cs=new Set();let uid=1;
const gen=()=>{let c;do c=[...Array(6)].map(()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random()*32|0]).join('');while(rooms.has(c));return c};
const cap=r=>r.mode*2,tc=(r,t)=>r.pl.filter(p=>p.t==t).length,bc=(r,k,d)=>r.pl.forEach(p=>p.send(k,d));
const push=r=>bc(r,'lobby',{code:r.code,mode:r.mode,bots:r.bots,host:r.pl[0].id,playing:!!r.g,players:r.pl.map(p=>({id:p.id,n:p.n,t:p.t,r:p.r,d:p.d}))});
const mk=(mode,q)=>{const r={code:gen(),mode,q,bots:0,pl:[],g:null};rooms.set(r.code,r);return r};
const okStart=r=>!r.g&&r.pl.length>0&&(r.pl.length==cap(r)||r.bots)&&r.pl.every(p=>p.r)&&tc(r,0)<=cap(r)/2&&tc(r,1)<=cap(r)/2;
function leave(c){const r=c.room;if(!r)return;c.room=null;r.pl=r.pl.filter(p=>p!==c);
 if(r.g&&c.j>=0){r.g.S.bot1(c.j);bc(r,'left',c.n);if(!r.pl.some(p=>p.j>=0))r.g=null}c.j=-1;
 if(!r.pl.length)rooms.delete(r.code);else push(r)}
function join(c,d){leave(c);c.n=String(d.n||'Spieler').slice(0,12);c.d=d.d=='🎮'?'🎮':'⌨️';c.r=0;c.j=-1;const mode=d.mode==2?2:1;let r;
 if(d.kind=='q'){r=[...rooms.values()].find(x=>x.q&&!x.g&&x.mode==mode&&x.pl.length<cap(x))||mk(mode,1)}
 else if(d.kind=='mk')r=mk(1,0);
 else{r=rooms.get(String(d.code||'').toUpperCase().replace(/[^A-Z0-9]/g,''));if(!r)return c.send('err','Keine Lobby mit diesem Code gefunden');if(r.g)return c.send('err','Match läuft bereits');if(r.pl.length>=cap(r))return c.send('err','Lobby ist voll')}
 c.t=tc(r,0)<=tc(r,1)?0:1;c.room=r;r.pl.push(c);push(r)}
function start(c){const r=c.room;if(!r||c!==r.pl[0]||!okStart(r))return c.send('err','Start nicht möglich');
 const ro=r.pl.map((p,j)=>(p.j=j,{peer:p.id,name:p.n,team:p.t}));let k=0;
 for(const t of[0,1])while(ro.filter(x=>x.team==t).length<cap(r)/2)ro.push({peer:'bot'+k,name:'Bot '+(++k),team:t,bot:1});
 const S=Sim(cl,wrap,L,W,GW,GH,BR);S.init(ro,300);r.g={S,acc:0,sn:0,last:Date.now()};bc(r,'start',{id:Math.random().toString(36).slice(2,10),roster:ro,h:'srv',tl:300});push(r)}
function msg(c,k,d){d=d||{};
 if(k=='join')join(c,d);else if(k=='leave')leave(c);
 else if(k=='inp'){const r=c.room;if(r&&r.g&&c.j>=0)r.g.S.inp(c.j,d)}
 else if(k=='start')start(c);
 else if(k=='back'){const r=c.room;if(!r)return;if(r.g&&r.g.S.ph()=='end'){r.g=null;r.pl.forEach(p=>{p.j=-1;p.r=0})}if(!r.g)c.r=d.r?1:0;push(r)}
 else if(k=='set'){const r=c.room;if(!r)return;if('r' in d&&!r.g)c.r=d.r?1:0;if('d' in d)c.d=d.d=='🎮'?'🎮':'⌨️';
  if('t' in d&&!r.g){const t=d.t==1?1:0;if(t!=c.t){if(tc(r,t)<cap(r)/2)c.t=t;else c.send('err','Das andere Team ist voll')}}
  if(c===r.pl[0]&&!r.g){if((d.m==1||d.m==2)&&d.m!=r.mode&&r.pl.length<=d.m*2){r.mode=d.m;r.pl.forEach(p=>p.r=0)}if('bots' in d)r.bots=d.bots?1:0}
  push(r)}}
/* ---------- Match-Loop: 60 Hz Simulation, 20 Hz Snapshots ---------- */
setInterval(()=>{const now=Date.now();for(const r of rooms.values()){const g=r.g;if(!g)continue;const dt=Math.min(.1,(now-g.last)/1000);g.last=now;g.acc+=dt;let n=0;
 while(g.acc>=1/60&&n++<6){g.S.sim(1/60);g.acc-=1/60}if(n>=6)g.acc=0;g.sn+=dt;if(g.sn>=.05){g.sn=0;bc(r,'st',g.S.snap())}}},8);
/* ---------- HTTP + WebSocket ---------- */
const srv=http.createServer((q,s)=>{if(q.url=='/health'){s.end('ok');return}s.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});s.end(HTML)});
const frame=(op,b)=>{const n=b.length;let h;if(n<126)h=Buffer.from([0x80|op,n]);else if(n<65536)h=Buffer.from([0x80|op,126,n>>8,n&255]);else{h=Buffer.alloc(10);h[0]=0x80|op;h[1]=127;h.writeBigUInt64BE(BigInt(n),2)}return Buffer.concat([h,b])};
function parse(c){const b=c.buf;if(b.length<2)return null;const op=b[0]&15,m=b[1]&128;let len=b[1]&127,o=2;
 if(len==126){if(b.length<4)return null;len=b.readUInt16BE(2);o=4}else if(len==127){if(b.length<10)return null;len=Number(b.readBigUInt64BE(2));o=10}
 const tot=o+(m?4:0)+len;if(b.length<tot)return null;const p=Buffer.from(b.subarray(o+(m?4:0),tot));if(m)for(let i=0;i<p.length;i++)p[i]^=b[o+(i&3)];c.buf=b.subarray(tot);return{op,p}}
srv.on('upgrade',(req,sock)=>{const k=req.headers['sec-websocket-key'];if(!k||String(req.headers.upgrade).toLowerCase()!='websocket'){sock.destroy();return}
 sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+crypto.createHash('sha1').update(k+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')+'\r\n\r\n');sock.setNoDelay(true);
 const c={id:'p'+uid++,sock,alive:Date.now(),n:'Spieler',t:0,r:0,d:'⌨️',j:-1,room:null,buf:Buffer.alloc(0)};cs.add(c);
 c.send=(k,d)=>{if(!sock.destroyed)sock.write(frame(1,Buffer.from(JSON.stringify({k,d}))))};
 const drop=()=>{if(cs.delete(c))leave(c);sock.destroy()};
 sock.on('data',b=>{c.alive=Date.now();c.buf=Buffer.concat([c.buf,b]);if(c.buf.length>1<<17)return drop();
  for(let f;(f=parse(c));){if(f.op==8){drop();return}if(f.op==9)sock.write(frame(10,f.p));else if(f.op==1){try{const m=JSON.parse(f.p.toString());msg(c,m.k,m.d)}catch(e){}}}});
 sock.on('close',drop);sock.on('error',drop);c.send('hi',c.id)});
setInterval(()=>{const now=Date.now();for(const c of cs){if(now-c.alive>20000)c.sock.destroy();else if(!c.sock.destroyed)c.sock.write(frame(9,Buffer.alloc(0)))}},5000);
srv.listen(PORT,()=>console.log('Kick Arena Server läuft auf Port '+PORT));
