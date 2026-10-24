// Sunderkand path: renders the text, follows the live verse, and lets the leader move it.
// Live sync is Firebase Realtime Database (/live = {idx, at}); the leader signs in with
// Firebase Auth (email + PIN). Without Firebase the page still shows the full text.
import { FIREBASE_CONFIG, ADMIN_EMAIL, TOTAL } from './config.js';

// Small polyfills for older TV browsers (LG webOS 4-6 run Chromium 53-79).
// app.legacy.js is this file transpiled for browsers without modules; see README.
const EP = Element.prototype, DP = DocumentFragment.prototype;
for(const P of [EP, DP]) if(!P.append) P.append = function(...nodes){
  nodes.forEach(n => this.appendChild(typeof n === 'string' ? document.createTextNode(n) : n)); };
for(const P of [EP, DP]) if(!P.replaceChildren) P.replaceChildren = function(...nodes){ this.textContent=''; this.append(...nodes); };
if(!Object.entries) Object.entries = o => Object.keys(o).map(k => [k, o[k]]);
if(window.NodeList && !NodeList.prototype.forEach) NodeList.prototype.forEach = Array.prototype.forEach;
// import() hidden in a string so browsers without dynamic import can still parse this file.
const importURL = u => new Function('u', 'return import(u)')(u);

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

const SECTIONS = {
  'chalisa':{om:'॥ श्री ॥',title:'श्री हनुमान चालीसा',sub:'Shri Hanuman Chalisa',chip:'Hanuman Chalisa'},
  'sunderkand':{om:'॥ ॐ ॥',title:'सुन्दरकाण्ड',sub:'Shri Ramcharitmanas · Fifth step',chip:'Sunderkand'},
  'aarti-hanuman':{om:'॥ आरती ॥',title:'श्री हनुमान जी की आरती',sub:'Shri Hanuman ji ki Aarti',chip:'Hanuman Aarti'},
  'aarti-ramayan':{om:'॥ आरती ॥',title:'श्री रामायण जी की आरती',sub:'Shri Ramayan ji ki Aarti',chip:'Ramayan Aarti'}
};
const SEC_SHORT = {'chalisa':'चालीसा','sunderkand':'सुन्दरकाण्ड','aarti-hanuman':'हनुमान आरती','aarti-ramayan':'रामायण आरती'};
// Story pictures: symbols #sc-<scene> in index.html. Each scene lists the start indices
// (from story.json) of the story lines it illustrates.
const SCENES = {
  prayer:[0,1,38,42,43,639,642,651,655], gada:[2,5,7,36,210,214], fire:[10,298,300,302,304,308,647], herb:[12],
  lotus:[15,215], crown:[17,522,534], sun:[19], gate:[21,84,87,91,93], refuge:[23,27,474,478,485,487,491,495,502,513,607],
  jewel:[31,312,314,318,346,348], leap:[46,50,321], mainak:[54], surasa:[56,61,65], shadow:[69,72], lanka:[74,78,80],
  night:[83,96], tulsi:[100,103,106,110,114,121], ashok:[125,156,158,164,181,183,186,190,193,199],
  grass:[130,134,138,141,145], dream:[149], ring:[169,171,174,177], bow:[202,205,612,617,635], fruit:[221,225,327,330],
  fight:[229,234,237], bound:[243,246], court:[248,253,256,263,269,274,283,288,399,402,410,416,420,429,437,441,448,561,570],
  tail:[291,295], rock:[336,339], tear:[356,358], feet:[362,366,370,377], army:[381,385,389,393,398,578],
  journey:[455,461,467], ocean:[536,544,588,622], letter:[550,553,595,600], bridge:[630],
};
const SCENE_AT = {};
for(const [name,starts] of Object.entries(SCENES)) starts.forEach(i=>{ SCENE_AT[i]=name; });
const SVG_NS = 'http://www.w3.org/2000/svg';
function scenePic(name){
  const svg=document.createElementNS(SVG_NS,'svg'), use=document.createElementNS(SVG_NS,'use');
  svg.setAttribute('class','pic'); svg.setAttribute('viewBox','0 0 64 64'); svg.setAttribute('aria-hidden','true');
  use.setAttribute('href','#sc-'+name); svg.appendChild(use); return svg;
}

const $ = id => document.getElementById(id);
const store = {get(k,d){try{const v=localStorage.getItem('sk.'+k);return v===null?d:JSON.parse(v)}catch(e){return d}},
               set(k,v){try{localStorage.setItem('sk.'+k,JSON.stringify(v))}catch(e){}}};
const main = $('text');
const LEADERS = [].concat(ADMIN_EMAIL).map(e=>e.toLowerCase());

async function getJSON(url){ const r = await fetch(url); if(!r.ok) throw new Error(url+': '+r.status); return r.json(); }

// Everything below runs inside an async function rather than using top-level await,
// which older TV browsers (Chromium < 89) reject outright.
(async () => {
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
    const st=document.createElement('div'); st.className='story';
    if(ep>=0){ const sc=SCENE_AT[STORY[ep][0]]; if(sc) st.appendChild(scenePic(sc)); st.append(STORY[ep][1]); }
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
          : u.kind==='shlok' ? u.label : u.kind==='chhand' ? 'छंद '+(u.num||'').replace(/\s*छंद\s*/,'.') : u.kind==='colophon' ? 'इति' : (u.num ? 'पंक्ति '+u.num : 'टेक');
  return SEC_SHORT[u.section]+' · '+t;
}

// ---------- reading settings (per device) ----------
let show = Object.assign({hi:true,en:true,story:true,mean:false,pic:true}, store.get('show',{}));
let scale = store.get('scale',1);
function applyShow(){
  ['hi','en','story','mean','pic'].forEach(k=>{ document.body.classList.toggle('hide-'+k,!show[k]); $('t-'+k).setAttribute('aria-pressed',String(!!show[k])); });
  document.documentElement.style.setProperty('--scale',scale);
}
['hi','en','story','mean','pic'].forEach(k=>$('t-'+k).addEventListener('click',()=>{
  show[k]=!show[k]; if(!show.hi&&!show.en){ show[k==='hi'?'en':'hi']=true; }
  store.set('show',show); applyShow(); keepCurrentInView();
}));
$('fs-up').addEventListener('click',()=>{scale=Math.min(1.6,+(scale+.1).toFixed(2));store.set('scale',scale);applyShow();keepCurrentInView();});
$('fs-dn').addEventListener('click',()=>{scale=Math.max(.8,+(scale-.1).toFixed(2));store.set('scale',scale);applyShow();keepCurrentInView();});
// Top-bar panels: at most one open at a time.
const PANELS = {share:'shareBtn', finder:'findBtn', settings:'settingsBtn'};
function openPanel(id){
  Object.entries(PANELS).forEach(([p,b])=>{ $(p).hidden = p!==id; $(b).setAttribute('aria-expanded',String(p===id)); });
}
const togglePanel = id => openPanel($(id).hidden ? id : null);
$('settingsBtn').addEventListener('click',()=>togglePanel('settings'));
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

// ---------- find a verse by number (or by words) ----------
// Each verse gets a short key: sec (sk/hc/ha/ra), kind (c chaupai, d doha, s shlok, h chhand, a aarti)
// and its number as typed, e.g. Sunderkand chaupai '12.4', doha '39क', chhand base '3' + sub '1'.
const SEC_KEY = {'sunderkand':'sk','chalisa':'hc','aarti-hanuman':'ha','aarti-ramayan':'ra'};
const KIND_KEY = {'chaupai':'c','doha':'d','shlok':'s','chhand':'h','aarti':'a'};
// Roman spellings vary (pavan tanay / Pavanatanay, sita / seetaa), so text search compares consonants only.
const skel = t => t.toLowerCase().normalize('NFD').replace(/[^a-z]+/g,'').replace(/w/g,'v').replace(/[aeiouy]+/g,'');
const DEVA = /[ऀ-ॿ]/;
const IDX = (()=>{
  let hcDoha=0;
  return V.map((u,i)=>{
    const e={i, sec:SEC_KEY[u.section], kind:KIND_KEY[u.kind]||'', num:null, sub:null,
             hi:u.hi.join(' '), en:skel(u.en.join(' '))};
    if(u.kind==='chhand'){ const m=/^(\S+)\s+छंद\s+(\d+)/.exec(u.num||''); if(m){ e.num=m[1]; e.sub=m[2]; } }
    else if(u.kind==='shlok') e.num=(u.num||'').replace(/\D+/g,'')||null;
    else if(u.section==='chalisa' && u.kind==='doha') e.num=String(++hcDoha);
    else e.num=u.num||null;
    return e;
  });
})();
const WORDS = {
  kind:{d:['d','do','doha','dohaa','दो','दोहा'], c:['c','ch','chau','chaupai','chaupaai','chaupayi','chopai','chowpai','चौ','चौपाई','चौपाइ'],
        s:['s','sh','shlok','shloka','slok','sloka','श्लोक'], h:['chhand','chhanda','chand','छंद','छन्द'], a:['aarti','arti','आरती']},
  sec:{hc:['hc','chalisa','चालीसा'], sk:['sk','sunderkand','sundarkand','sunderkaand','सुन्दरकाण्ड','सुंदरकांड'], ra:['ramayan','ramayana','रामायण']}
};
const lookup = (group,w)=>Object.keys(WORDS[group]).find(k=>WORDS[group][k].includes(w));

function findVerses(q){
  q=q.toLowerCase().replace(/[०-९]/g,d=>'०१२३४५६७८९'.indexOf(d)).trim();
  if(!q) return [];
  const m=/(\d+)(?:\s*[.:]\s*(\d+))?\s*(क|ख|kha|ka|kh|k)?(?![a-z])/.exec(q);
  let N=null;
  if(m){ N=m[1]+(m[2]?'.'+m[2]:'')+(m[3]?(/^(ख|kh)/.test(m[3])?'ख':'क'):''); q=(q.slice(0,m.index)+' '+q.slice(m.index+m[0].length)); }
  const words=q.split(/[^a-zऀ-ॿ]+/).filter(Boolean);
  let kind=null, sec=null, other=[];
  words.forEach(w=>{ const k=lookup('kind',w), s=lookup('sec',w); if(k) kind=k; else if(s) sec=s; else other.push(w); });
  if(kind==='a' && sec===null) sec='aarti';
  const secOk = e => !sec || e.sec===sec || (sec==='aarti' && (e.sec==='ha'||e.sec==='ra'));
  const kindOk = e => !kind || e.kind===kind;
  let hits=[];
  if(N!==null){
    const dot=N.includes('.'), bare=N.replace(/[कख]$/,'');
    IDX.forEach(e=>{
      if(!secOk(e) || !kindOk(e) || e.num===null) return;
      let score=-1;
      const plainNum = !dot && N===bare;   // "12", not "12.4" or "39क"
      if(e.kind==='h') score = dot ? (e.num+'.'+e.sub===N ? 0 : -1) : (plainNum && e.num===N ? 1 : -1);
      else if(e.num===N) score=0;
      else if(plainNum && e.kind==='d' && e.num.replace(/[कख]$/,'')===N) score=0;   // "39" finds 39क and 39ख
      else if(plainNum && e.kind==='c' && e.sec==='sk' && e.num.startsWith(N+'.')) score=1;   // "12" also lists chaupais 12.x
      if(score>=0) hits.push([score,e]);
    });
  } else if(kind || sec){
    IDX.forEach(e=>{ if(secOk(e) && kindOk(e)) hits.push([0,e]); });
  } else {
    const t=skel(other.join(' ')), raw=words.join(' '), hiQ=DEVA.test(raw) && raw.length>=2;
    if(t.length<3 && !hiQ) return [];
    IDX.forEach(e=>{ if((t.length>=3 && e.en.includes(t)) || (hiQ && e.hi.includes(raw))) hits.push([0,e]); });
  }
  // Exact before "chaupais under this doha", then Sunderkand first, then text order.
  hits.sort((a,b)=>a[0]-b[0] || (a[1].sec!=='sk')-(b[1].sec!=='sk') || a[1].i-b[1].i);
  return hits.map(h=>h[1].i);
}

const MAX_RES=8;
let foundTimer=0;
function showFinder(on){
  openPanel(on ? 'finder' : null);
  if(on){ $('findIn').focus(); $('findIn').select(); }
}
function renderResults(){
  const box=$('findRes'), list=findVerses($('findIn').value);
  box.replaceChildren();
  if(!$('findIn').value.trim()) return;
  if(!list.length){ const p=document.createElement('p'); p.className='note'; p.textContent='No verse matches. Try 12.4, doha 12, shlok 2 or chalisa 7.'; box.append(p); return; }
  list.slice(0,MAX_RES).forEach(i=>{
    const b=document.createElement('button'); b.type='button'; b.className='res'; b.setAttribute('role','option');
    const t=document.createElement('b'); t.textContent=describe(i);
    const l=document.createElement('span'); l.lang='hi'; l.textContent=V[i].hi[0];
    b.append(t,l); b.addEventListener('click',()=>jumpTo(i)); box.append(b);
  });
  if(list.length>MAX_RES){ const p=document.createElement('p'); p.className='note'; p.textContent=`${list.length-MAX_RES} more. Type the full number, e.g. 12.4.`; box.append(p); }
}
function jumpTo(i){
  showFinder(false);
  if(!isAdmin) setFollow(false,true);   // a viewer stays here until "Back to live verse"
  const el=els[i];
  progScroll=true; progQuietSoon(300);
  el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
  document.querySelectorAll('.v.found').forEach(x=>x.classList.remove('found'));
  el.classList.add('found'); clearTimeout(foundTimer); foundTimer=setTimeout(()=>el.classList.remove('found'),2500);
}
$('findBtn').addEventListener('click',()=>showFinder($('finder').hidden));
$('findIn').addEventListener('input',renderResults);
$('findForm').addEventListener('submit',e=>{ e.preventDefault(); const r=findVerses($('findIn').value); if(r.length) jumpTo(r[0]); else renderResults(); });
addEventListener('keydown',e=>{
  if(e.key==='Escape' && !$('finder').hidden){ showFinder(false); $('findBtn').focus(); }
  else if(e.key==='/' && !e.target.closest('input,textarea')){ e.preventDefault(); showFinder(true); }
});

// ---------- share: QR code + link ----------
const PAGE_URL = location.origin + location.pathname;
let qrDone=false;
function loadScript(src){ return new Promise((ok,fail)=>{ const s=document.createElement('script'); s.src=src; s.onload=ok; s.onerror=fail; document.head.appendChild(s); }); }
async function drawQR(){
  if(qrDone) return;
  try{
    if(!window.QRCode) await loadScript(QR_LIB);
    new window.QRCode($('qrcode'),{text:PAGE_URL,width:264,height:264,colorDark:'#000000',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});
    qrDone=true;
  }catch(e){ $('qrcode').hidden=true; }
}
$('qrurl').textContent=PAGE_URL;
$('shareBtn').addEventListener('click',()=>{ togglePanel('share'); if(!$('share').hidden) drawQR(); });
$('copyBtn').addEventListener('click',async()=>{
  const b=$('copyBtn');
  try{ await navigator.clipboard.writeText(PAGE_URL); b.textContent='Copied'; }
  catch(e){ getSelection().selectAllChildren($('qrurl')); b.textContent='Link selected'; }
  setTimeout(()=>{ b.textContent='Copy link'; },2000);
});
if(navigator.share){
  $('nativeShareBtn').hidden=false;
  $('nativeShareBtn').addEventListener('click',()=>navigator.share({title:document.title,url:PAGE_URL}).catch(()=>{}));
}

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

function setAdmin(on){
  isAdmin=on;
  document.body.classList.toggle('admin',on);
  $('remote').hidden=!on; $('resetRow').hidden=!on; $('stopRow').hidden=!on;
  $('leadRow').hidden=on; $('pinForm').hidden=true;
  if(on){ resetUI(); setFollow(true,true); keepCurrentInView(); }
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
    // No live sync configured: hide the follow and leader controls until it is.
    $('followRow').hidden=true; $('leadRow').hidden=true;
    broken=true; updateStatus(); return;
  }
  try{
    const [appM, dbM, authM] = await Promise.all([
      importURL(FB+'firebase-app.js'), importURL(FB+'firebase-database.js'), importURL(FB+'firebase-auth.js')]);
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
})();
