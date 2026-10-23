// Sunderkand path: renders the text, follows the live verse, and lets the leader move it.
// Live sync is Firebase Realtime Database (/live = {idx, at}); the leader signs in with
// Firebase Auth (email + PIN). Without Firebase the page still shows the full text.
import { FIREBASE_CONFIG, ADMIN_EMAIL, TOTAL } from './config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

const SECTIONS = {
  'chalisa':{om:'॥ श्री ॥',title:'श्री हनुमान चालीसा',sub:'Shri Hanuman Chalisa',chip:'Hanuman Chalisa'},
  'sunderkand':{om:'॥ ॐ ॥',title:'सुन्दरकाण्ड',sub:'Shri Ramcharitmanas · Fifth step',chip:'Sunderkand'},
  'aarti-hanuman':{om:'॥ आरती ॥',title:'श्री हनुमान जी की आरती',sub:'Shri Hanuman ji ki Aarti',chip:'Hanuman Aarti'},
  'aarti-ramayan':{om:'॥ आरती ॥',title:'श्री रामायण जी की आरती',sub:'Shri Ramayan ji ki Aarti',chip:'Ramayan Aarti'}
};
const SEC_SHORT = {'chalisa':'चालीसा','sunderkand':'सुन्दरकाण्ड','aarti-hanuman':'हनुमान आरती','aarti-ramayan':'रामायण आरती'};

const $ = id => document.getElementById(id);
const store = {get(k,d){try{const v=localStorage.getItem('sk.'+k);return v===null?d:JSON.parse(v)}catch(e){return d}},
               set(k,v){try{localStorage.setItem('sk.'+k,JSON.stringify(v))}catch(e){}}};
const main = $('text');
const LEADERS = [].concat(ADMIN_EMAIL).map(e=>e.toLowerCase());

async function getJSON(url){ const r = await fetch(url); if(!r.ok) throw new Error(url+': '+r.status); return r.json(); }

let V, STORY;
try{ [V, STORY] = await Promise.all([getJSON('verses.json'), getJSON('story.json')]); }
catch(e){
  main.innerHTML = '<p class="loading">The text could not be loaded. Check your connection and reload the page.</p>';
  throw e;
}
if(V.length !== TOTAL) console.warn(`verses.json has ${V.length} verses; config.js TOTAL is ${TOTAL}`);

// ---------- render ----------
const els = [];
{
  const frag = document.createDocumentFragment();
  let lastSec = null, ep = -1;
  V.forEach((u,i)=>{
    if(u.section!==lastSec){
      lastSec=u.section;
      const s=SECTIONS[u.section], h=document.createElement('div');
      h.className='sec'; h.id='sec-'+u.section;
      h.innerHTML='<div class="om"></div><h2></h2><p></p>';
      h.querySelector('.om').textContent=s.om; h.querySelector('h2').textContent=s.title; h.querySelector('p').textContent=s.sub;
      frag.appendChild(h);
    }
    const a=document.createElement('article');
    a.className='v k-'+u.kind; a.dataset.i=i;
    const lab=document.createElement('div'); lab.className='lab';
    const b=document.createElement('b');
    b.textContent = u.kind==='chaupai' ? u.num
                  : u.kind==='doha' ? (u.section==='sunderkand' ? 'दो. '+u.num : 'दोहा')
                  : u.kind==='shlok' ? 'श्लोक' : u.kind==='chhand' ? 'छंद' : u.kind==='colophon' ? '' : (u.num||'टेक');
    lab.appendChild(b);
    if(u.kind==='chaupai' && u.section==='sunderkand'){ const s=document.createElement('span'); s.textContent='चौ.'; lab.appendChild(s); }
    const body=document.createElement('div'); body.className='body';
    const hi=document.createElement('div'); hi.className='hi'; hi.lang='hi';
    u.hi.forEach((l,k)=>{ if(k) hi.appendChild(document.createElement('br')); hi.appendChild(document.createTextNode(l)); });
    const en=document.createElement('div'); en.className='en';
    u.en.forEach((l,k)=>{ if(k) en.appendChild(document.createElement('br')); en.appendChild(document.createTextNode(l)); });
    // A verse's story line is the last entry whose start index is <= the verse index.
    let isStart=false; while(ep+1<STORY.length && STORY[ep+1][0]<=i){ ep++; isStart = STORY[ep][0]===i; }
    if(isStart) a.classList.add('ep');
    const st=document.createElement('div'); st.className='story'; st.textContent = ep>=0 ? STORY[ep][1] : '';
    const m=document.createElement('div'); m.className='mean'; m.textContent=u.mean;
    body.append(hi,en,st,m); a.append(lab,body);
    frag.appendChild(a); els.push(a);
  });
  main.replaceChildren(frag);
}

Object.keys(SECTIONS).forEach(k=>{
  const c=document.createElement('button'); c.className='chip'; c.textContent=SECTIONS[k].chip; c.dataset.sec=k;
  c.addEventListener('click',()=>{ setFollow(false,true); $('sec-'+k).scrollIntoView({behavior:'smooth',block:'start'}); });
  $('chips').appendChild(c);
});

function describe(i){
  const u=V[i]; if(!u) return '';
  const t = u.kind==='chaupai' ? 'चौपाई '+u.num
          : u.kind==='doha' ? (u.section==='sunderkand' ? 'दोहा '+u.num : 'दोहा')
          : u.kind==='shlok' ? u.label : u.kind==='chhand' ? 'छंद' : u.kind==='colophon' ? 'इति' : (u.num ? 'पंक्ति '+u.num : 'टेक');
  return SEC_SHORT[u.section]+' · '+t;
}

// ---------- reading settings (per device) ----------
let show = Object.assign({hi:true,en:true,story:true,mean:false}, store.get('show',{}));
let scale = store.get('scale',1);
function applyShow(){
  ['hi','en','story','mean'].forEach(k=>{ document.body.classList.toggle('hide-'+k,!show[k]); $('t-'+k).setAttribute('aria-pressed',String(!!show[k])); });
  document.documentElement.style.setProperty('--scale',scale);
}
['hi','en','story','mean'].forEach(k=>$('t-'+k).addEventListener('click',()=>{
  show[k]=!show[k]; if(!show.hi&&!show.en){ show[k==='hi'?'en':'hi']=true; }
  store.set('show',show); applyShow(); keepCurrentInView();
}));
$('fs-up').addEventListener('click',()=>{scale=Math.min(1.6,+(scale+.1).toFixed(2));store.set('scale',scale);applyShow();keepCurrentInView();});
$('fs-dn').addEventListener('click',()=>{scale=Math.max(.8,+(scale-.1).toFixed(2));store.set('scale',scale);applyShow();keepCurrentInView();});
$('settingsBtn').addEventListener('click',()=>{const p=$('settings');p.hidden=!p.hidden;$('settingsBtn').setAttribute('aria-expanded',String(!p.hidden));});
applyShow();

// ---------- current verse + follow ----------
let cur = -1, follow = store.get('follow',true), progScroll = false, progTimer = 0, isAdmin = false;
// progScroll is true while the page itself is scrolling to the live verse, so that scroll isn't read as the viewer leaving.
function progQuietSoon(ms){ clearTimeout(progTimer); progTimer=setTimeout(()=>{ progScroll=false; },ms); }
function setFollow(on,quiet){
  follow=on; store.set('follow',on);
  $('t-follow').setAttribute('aria-pressed',String(on)); $('t-follow').textContent=on?'On':'Off';
  updateBack();
  if(on && !quiet) scrollToCur(true);
}
setFollow(follow,true);
$('t-follow').addEventListener('click',()=>setFollow(!follow));
$('backBtn').addEventListener('click',()=>setFollow(true));

function inView(el){ const r=el.getBoundingClientRect(); return r.bottom>120 && r.top<innerHeight-120; }
function updateBack(){ $('backBtn').hidden = isAdmin || cur<0 || follow; }
function scrollToCur(smooth){
  const el=els[cur]; if(!el) return;
  progScroll=true; progQuietSoon(300);
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({behavior:(smooth&&!reduce)?'smooth':'auto',block:'center'});
}
function keepCurrentInView(){ if(follow && cur>=0) scrollToCur(false); }

function highlight(i,opts={}){
  if(i===cur || !els[i]) return;
  const prev=cur; cur=i;
  if(prev>=0) els[prev].classList.remove('cur');
  // Mark past verses, touching only the range that changed.
  if(prev<0){ for(let k=0;k<i;k++) els[k].classList.add('past'); }
  else for(let k=Math.min(prev,i);k<=Math.max(prev,i);k++) els[k].classList.toggle('past',k<i);
  els[i].classList.remove('past'); els[i].classList.add('cur');
  $('poshead').textContent=describe(i);
  $('posline').textContent='Now reciting';
  $('rnow').textContent=describe(i);
  $('rnext').textContent=V[i+1]?('Next: '+describe(i+1)):'End of path';
  $('prevBtn').disabled=i<=0; $('nextBtn').disabled=i>=V.length-1;
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('here',c.dataset.sec===V[i].section));
  if(follow || opts.force) scrollToCur(prev>=0);
  updateBack();
}

addEventListener('scroll',()=>{
  if(progScroll){ progQuietSoon(200); return; }
  if(cur<0 || isAdmin) return;
  if(follow && !inView(els[cur])) setFollow(false,true);
},{passive:true});

// ---------- keep screen awake ----------
let lock=null;
async function wake(){ try{ if('wakeLock' in navigator && !lock && document.visibilityState==='visible'){ lock=await navigator.wakeLock.request('screen'); lock.addEventListener('release',()=>{lock=null}); } }catch(e){} }
document.addEventListener('visibilitychange',wake);
addEventListener('pointerdown',wake,{once:true});
wake();

// ---------- live status ----------
let connected=false, everConnected=false, gotData=false, gaveUp=false, broken=false;
function note(msg){ const n=$('connNote'); n.hidden=!msg; n.textContent=msg||''; }
function updateStatus(){
  const on = !broken && connected && gotData;
  $('live').classList.toggle('on',on);
  $('livetxt').textContent = on ? (isAdmin ? 'Leading' : 'Live')
                           : (!broken && !everConnected && !gaveUp) ? 'Connecting' : 'Reading only';
}
function offline(msg){ broken=true; updateStatus(); note(msg); }
setTimeout(()=>{ gaveUp=true; updateStatus(); }, 6000);

// ---------- leader: moves + writes ----------
let fb=null, auth=null, liveRef=null, writing=null, wanted=null;
async function push(i){
  // Only one write in flight; rapid taps coalesce to the latest index.
  wanted=i; if(writing!==null) return;
  while(wanted!==null){
    writing=wanted; wanted=null;
    try{ await fb.set(liveRef,{idx:writing, at:fb.serverTimestamp()}); note(''); }
    catch(e){ note(e && e.code==='PERMISSION_DENIED'
      ? 'The database refused this move. Check that the leader UID in the database rules matches this account.'
      : 'Your last move didn’t reach the others. Tap Next or the verse again to retry.'); }
  }
  writing=null;
}
function go(i){
  if(!isAdmin) return;
  i=Math.max(0,Math.min(V.length-1,i)); follow=true; highlight(i,{force:true}); push(i);
}
$('nextBtn').addEventListener('click',()=>go(cur+1));
$('prevBtn').addEventListener('click',()=>go(cur-1));
main.addEventListener('click',e=>{
  if(!isAdmin) return;
  const a=e.target.closest('.v'); if(a && !getSelection().toString()) go(+a.dataset.i);
});
addEventListener('keydown',e=>{
  if(!isAdmin || e.target.closest('input,textarea')) return;
  if(e.key===' ' && e.target.closest('button')) return; // the button's own click handles it
  if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' '||e.key==='PageDown'){ e.preventDefault(); go(cur+1); }
  if(e.key==='ArrowLeft'||e.key==='ArrowUp'||e.key==='PageUp'){ e.preventDefault(); go(cur-1); }
});

function resetUI(){
  const wrap=$('resetWrap'), b=document.createElement('button');
  b.className='tog'; b.textContent='Back to start';
  b.onclick=()=>{
    const q=document.createElement('span'); q.className='note'; q.textContent='Move everyone to the first verse?';
    const y=document.createElement('button'); y.className='tog primary'; y.textContent='Yes, start over';
    const n=document.createElement('button'); n.className='tog'; n.textContent='Cancel';
    y.onclick=()=>{ go(0); resetUI(); }; n.onclick=resetUI;
    wrap.replaceChildren(q,y,n);
  };
  wrap.replaceChildren(b);
}

let qrDone=false;
function loadScript(src){ return new Promise((ok,fail)=>{ const s=document.createElement('script'); s.src=src; s.onload=ok; s.onerror=fail; document.head.appendChild(s); }); }
async function showQR(){
  const url=location.origin+location.pathname;
  $('qrurl').textContent=url; $('qrbox').hidden=false;
  if(qrDone) return;
  try{
    if(!window.QRCode) await loadScript(QR_LIB);
    new window.QRCode($('qrcode'),{text:url,width:264,height:264,colorDark:'#000000',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});
    qrDone=true;
  }catch(e){ $('qrcode').hidden=true; }
}

function setAdmin(on){
  isAdmin=on;
  document.body.classList.toggle('admin',on);
  $('remote').hidden=!on; $('resetRow').hidden=!on; $('stopRow').hidden=!on;
  $('leadRow').hidden=on; $('pinForm').hidden=true;
  if(on){ resetUI(); showQR(); setFollow(true,true); keepCurrentInView(); }
  else $('qrbox').hidden=true;
  updateBack(); updateStatus();
}

// ---------- leader sign-in (Firebase Auth: the PIN is the password) ----------
$('leadBtn').addEventListener('click',()=>{
  if(!auth){ $('pinErr').textContent='Live sync isn’t available on this page, so leading is off.'; $('pinErr').hidden=false; $('pinForm').hidden=false; $('pin').hidden=true; $('pinGo').hidden=true; return; }
  $('pinForm').hidden=false; $('leadRow').hidden=true; $('pinErr').hidden=true; $('pin').focus();
});
$('pinCancel').addEventListener('click',()=>{ $('pinForm').hidden=true; $('leadRow').hidden=false; $('pin').value=''; });
$('pinForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!auth) return;
  const pin=$('pin').value; $('pinGo').disabled=true; $('pinErr').hidden=true;
  try{
    // Each leader has their own PIN; try the PIN against each leader account in turn.
    let last;
    for(const email of LEADERS){
      try{ await fb.signInWithEmailAndPassword(auth, email, pin); last=null; break; }
      catch(e){ last=e; if(e && e.code!=='auth/invalid-credential' && e.code!=='auth/wrong-password' && e.code!=='auth/user-not-found') break; }
    }
    if(last) throw last;
    $('pin').value='';
  }
  catch(err){
    const c=err && err.code || '';
    $('pinErr').textContent = c==='auth/too-many-requests' ? 'Too many tries. Wait a few minutes and try again.'
                            : c==='auth/network-request-failed' ? 'Can’t reach the server. Check your connection.'
                            : 'Wrong PIN';
    $('pinErr').hidden=false; $('pin').select();
  }
  $('pinGo').disabled=false;
});
$('stopBtn').addEventListener('click',()=>{ if(auth) fb.signOut(auth); });

// ---------- live sync ----------
async function startLive(){
  if(!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey==='REPLACE_ME' || !FIREBASE_CONFIG.databaseURL){
    return offline('Live sync isn’t set up yet. You can still read the full text.');
  }
  try{
    const [appM, dbM, authM] = await Promise.all([
      import(FB+'firebase-app.js'), import(FB+'firebase-database.js'), import(FB+'firebase-auth.js')]);
    fb = {...dbM, ...authM};
    const app = appM.initializeApp(FIREBASE_CONFIG);
    const db = dbM.getDatabase(app);
    auth = authM.getAuth(app);
    liveRef = dbM.ref(db,'live');
    dbM.onValue(dbM.ref(db,'.info/connected'), s=>{ connected = s.val()===true; if(connected) everConnected=true; updateStatus(); });
    let first=true;
    dbM.onValue(liveRef, snap=>{
      gotData=true; updateStatus();
      if(isAdmin && (writing!==null || wanted!==null)) return; // own pending move wins locally
      const d=snap.val(), i = d && Number.isInteger(d.idx) ? d.idx : 0;
      highlight(Math.max(0,Math.min(V.length-1,i)),{force:first});
      first=false;
    }, ()=>offline('Lost the live connection. Reload the page to reconnect; you can still read the full text.'));
    authM.onAuthStateChanged(auth, u=>setAdmin(!!u && LEADERS.includes((u.email||'').toLowerCase())));
  }catch(e){
    console.error(e);
    offline('Couldn’t load live sync. You can still read the full text.');
  }
}
startLive();
