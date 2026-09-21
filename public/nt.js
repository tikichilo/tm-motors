const API='/api/v1';
const WA_NUMBER='260978918196';
let allCars=[],activeSort='default',activeCar=null,enquiryCar=null,refreshTimer=null;
let modalImgs=[],modalIdx=0,slideshowTimer=null,slideshowOn=false;
const cardState={};

/* ── WhatsApp URL builder ── */
function waUrl(msg){return`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;}
function waCarMsg(c){return`Hi Nottest Drive Motors! I'm interested in the ${c.year?c.year+' ':''}${c.make} ${c.model}${c.color?' ('+c.color+')':''} listed at K ${Number(c.price).toLocaleString('en-ZM')}. Can you give me more details?`;}

/* ── NOTIFICATION SYSTEM ── */
function notify(title,sub='',type='default',duration=3800){
  const wrap=document.getElementById('notif-wrap');
  const icons={default:'🔔',success:'✅',error:'❌',info:'ℹ️'};
  const el=document.createElement('div');
  el.className=`notif ${type}`;
  el.innerHTML=`<div class="notif-icon">${icons[type]||icons.default}</div><div class="notif-content"><div class="notif-title">${title}</div>${sub?`<div class="notif-sub">${sub}</div>`:''}</div><button class="notif-close" onclick="dismissNotif(this.parentElement)">✕</button>`;
  el.style.setProperty('--dur',duration+'ms');
  const bar=document.createElement('style');
  const uid='n'+Date.now();
  el.id=uid;
  bar.textContent=`#${uid}::before{animation-duration:${duration}ms;}`;
  document.head.appendChild(bar);
  wrap.appendChild(el);
  const t=setTimeout(()=>dismissNotif(el,bar),duration);
  el._timer=t;el._style=bar;
}
function dismissNotif(el,styleEl){
  if(!el||!el.parentElement)return;
  clearTimeout(el._timer);
  el.classList.add('out');
  const s=styleEl||el._style;
  setTimeout(()=>{el.remove();if(s)s.remove();},350);
}

/* ── UTILITIES ── */
function fmtK(n){return n?'K '+Number(n).toLocaleString('en-ZM'):'—';}
function getImgs(c){return(c.images&&c.images.length)?c.images:(c.image?[c.image]:[]);}
function setStockBadge(count){
  const el=document.getElementById('stock-badge');
  if(el)el.innerHTML=`<span style="color:var(--success)">⬤</span> ${count} vehicle${count!==1?'s':''} available`;
}

/* ── INIT ── */
async function init(){
  try{
    const res=await fetch(`${API}/cars`);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();
    allCars=(Array.isArray(data)?data:[]).map(c=>({...c,id:c.id||c._id}));
    document.getElementById('stat-stock').textContent=allCars.length;
    setStockBadge(allCars.length);
    renderHeroFeatured();
    renderTrending();
    filterCars();
  }catch(err){
    console.error('INIT ERROR:',err);
    document.getElementById('cars-grid').innerHTML=`<div class="empty"><div class="empty-icon">⚙️</div><h3>Inventory failed to load</h3><p>${err.message||'Server error'}</p></div>`;
    setStockBadge(0);
    document.getElementById('stat-stock').textContent='0';
  }
}

/* ── AUTO REFRESH ── */
function startAutoRefresh(){
  if(refreshTimer)clearInterval(refreshTimer);
  refreshTimer=setInterval(async()=>{
    try{
      const res=await fetch(`${API}/cars`);
      if(!res.ok)return;
      const data=await res.json();
      allCars=(Array.isArray(data)?data:[]).map(c=>({...c,id:c.id||c._id}));
      setStockBadge(allCars.length);
      document.getElementById('stat-stock').textContent=allCars.length;
      renderTrending();
      filterCars();
    }catch(e){console.warn('Auto-refresh failed:',e);}
  },60000);
}

/* ── HERO FEATURED ── */
function renderHeroFeatured(){
  const featured=allCars.slice(0,3);
  const el=document.getElementById('hero-featured');
  if(!featured.length){el.innerHTML='';return;}
  el.innerHTML=featured.map(c=>`
    <div class="feat-card" onclick="openModal('${c.id}')">
      <div class="feat-card-img">
        ${c.image?`<img src="${c.image}" alt="${c.make} ${c.model}" onerror="this.parentElement.innerHTML='🚗'" loading="lazy"/>`:'🚗'}
      </div>
      <div class="feat-card-body">
        <div class="feat-card-name">${c.make} ${c.model}</div>
        <div class="feat-card-meta">${[c.year,c.color,c.mileage?c.mileage.toLocaleString()+' km':''].filter(Boolean).join(' · ')}</div>
        <div class="feat-card-price"><span style="font-size:13px;font-family:'DM Sans';font-weight:600;">K </span>${Number(c.price).toLocaleString('en-ZM')}</div>
        <div class="feat-avail"><span class="dot-live"></span>Available</div>
      </div>
    </div>`).join('');
}

/* ── TRENDING (auto-rotates every Monday, fully automatic — no manual picks) ── */
function getWeekKey(d=new Date()){
  // ISO week number, computed in local time so it flips over at local midnight Monday
  const date=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const day=(date.getDay()+6)%7; // Mon=0 ... Sun=6
  date.setDate(date.getDate()-day+3); // nearest Thursday defines the ISO week
  const firstThursday=new Date(date.getFullYear(),0,4);
  const fdDay=(firstThursday.getDay()+6)%7;
  firstThursday.setDate(firstThursday.getDate()-fdDay+3);
  const week=1+Math.round((date-firstThursday)/(7*24*3600*1000));
  return{key:`${date.getFullYear()}-W${week}`,year:date.getFullYear(),week};
}
function seededShuffle(arr,seedStr){
  let seed=0;
  for(let i=0;i<seedStr.length;i++)seed=(seed*31+seedStr.charCodeAt(i))>>>0;
  function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function getTrendingCars(){
  if(!allCars.length)return[];
  const {key}=getWeekKey();
  const shuffled=seededShuffle(allCars,key);
  return shuffled.slice(0,Math.min(5,shuffled.length));
}
function renderTrending(){
  const wrap=document.getElementById('trending-section-wrap');
  const track=document.getElementById('trending-track');
  const weekLbl=document.getElementById('trending-week-label');
  if(!wrap||!track)return;
  const trending=getTrendingCars();
  if(!trending.length){wrap.style.display='none';return;}
  wrap.style.display='block';
  if(weekLbl){
    const{week}=getWeekKey();
    weekLbl.textContent=`Week ${week} pick · refreshes every Monday`;
  }
  const cardHTML=c=>{
    const img=getImgs(c)[0]||'';
    return`<div class="trending-card" onclick="openModal('${c.id}')">
      <div class="trending-ribbon">🔥 Trending</div>
      <div class="trending-img">${img?`<img src="${img}" alt="${c.make} ${c.model}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=trending-img-ph>🚗</div>'"/>`:`<div class="trending-img-ph">🚗</div>`}</div>
      <div class="trending-body">
        <div class="trending-name">${c.make} ${c.model}</div>
        <div class="trending-meta">${[c.year,c.color].filter(Boolean).join(' · ')}</div>
        <div class="trending-price"><span style="font-size:11px;font-family:'DM Sans';font-weight:600;">K </span>${Number(c.price).toLocaleString('en-ZM')}</div>
      </div>
    </div>`;
  };
  const cardsHTML=trending.map(cardHTML).join('');
  // duplicate the set so the marquee can loop seamlessly from -50%
  track.innerHTML=cardsHTML+cardsHTML;
  track.style.animationDuration=Math.max(18,trending.length*7)+'s';
}

/* ── FILTER / SORT ── */
function filterCars(){
  const q=document.getElementById('search').value.toLowerCase().trim();
  const p=document.getElementById('filter-price').value;
  let list=allCars.filter(c=>{
    const txt=`${c.make} ${c.model} ${c.color||''} ${c.year||''}`.toLowerCase();
    const mQ=!q||txt.includes(q);
    let mP=true;
    if(p==='low')mP=c.price<300000;
    if(p==='mid')mP=c.price>=300000&&c.price<=450000;
    if(p==='high')mP=c.price>450000;
    return mQ&&mP;
  });
  if(activeSort==='price-asc')list.sort((a,b)=>a.price-b.price);
  if(activeSort==='price-desc')list.sort((a,b)=>b.price-a.price);
  if(activeSort==='year')list.sort((a,b)=>(b.year||0)-(a.year||0));
  renderGrid(list);
  setStockBadge(list.length);
}
function sortBy(type,el){
  activeSort=type;
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  filterCars();
}

/* ── RENDER GRID ── */
/* Urgency signals: show "Only 1 left!" on ~20% of listings randomly (seeded by id) */
function showUrgency(id){
  const hash=String(id).split('').reduce((a,c)=>a+c.charCodeAt(0),0);
  return hash%5===0;
}

function renderGrid(cars){
  const grid=document.getElementById('cars-grid');
  if(!cars.length){
    grid.innerHTML=`<div class="empty"><div class="empty-icon">🚗</div><h3>No vehicles found</h3><p>Try adjusting your search or filters</p></div>`;
    return;
  }
  grid.innerHTML=cars.map(c=>{
    const imgs=getImgs(c);
    const multi=imgs.length>1;
    const slides=imgs.length
      ?imgs.map(src=>`<div class="card-img-slide"><img src="${src}" alt="${c.make} ${c.model}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=card-img-ph>🚗</div>'"/></div>`).join('')
      :`<div class="card-img-slide"><div class="card-img-ph">🚗</div></div>`;
    const dots=multi?imgs.map((_,i)=>`<div class="card-dot ${i===0?'active':''}" onclick="event.stopPropagation();cardGoTo('${c.id}',${i})"></div>`).join(''):'';
    const urgent=showUrgency(c.id);
    return`<div class="car-card" id="card-${c.id}" onclick="openModal('${c.id}')">
      <div class="card-img">
        <div class="card-img-slides" id="slides-${c.id}">${slides}</div>
        ${multi?`<button class="card-nav prev" onclick="event.stopPropagation();cardPrev('${c.id}')">&#8249;</button><button class="card-nav next" onclick="event.stopPropagation();cardNext('${c.id}')">&#8250;</button>`:''}
        <div class="badge-avail"><span class="dot-live"></span>Available</div>
        ${c.year?`<div class="badge-year">${c.year}</div>`:''}
        ${urgent?`<div class="badge-urgent show">🔥 High Interest</div>`:''}
        ${multi?`<div class="card-dots" id="dots-${c.id}">${dots}</div>`:''}
      </div>
      <div class="card-body">
        <div class="card-name">${c.make} ${c.model}</div>
        <div class="card-meta">
          ${c.color?`<span>${c.color}</span>`:''}
          ${c.color&&c.mileage?`<span class="card-sep">·</span>`:''}
          ${c.mileage?`<span>${c.mileage.toLocaleString()} km</span>`:''}
        </div>
        <p class="card-desc">${c.description||'Well-maintained vehicle ready for immediate delivery.'}</p>
        <div class="card-price-row">
          <div><div class="price-label">Asking Price</div><div class="price"><span class="price-curr">K</span>${Number(c.price).toLocaleString('en-ZM')}</div></div>
          ${c.mileage?`<div class="km-wrap"><div class="km-val">${c.mileage.toLocaleString()}</div><div class="km-label">km</div></div>`:''}
        </div>
        <div class="price-neg-hint">Price negotiable — call or WhatsApp us</div>
        <div class="card-divider"></div>
        <div class="card-actions" onclick="event.stopPropagation()">
          <button class="btn-wa-card" onclick="openWhatsApp('${c.id}')">
            <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </button>
          <button class="btn-enquire" onclick="openEnquiryForm('${c.id}')" title="Send enquiry form">📋</button>
          <button class="btn-view" onclick="openModal('${c.id}')" title="View Details">👁</button>
        </div>
      </div>
    </div>`;
  }).join('');
  cars.forEach(c=>{
    const imgs=getImgs(c);
    if(imgs.length>1){cardState[c.id]={idx:0};initCardSwipe(c.id,imgs.length);}
  });
}

/* ── WhatsApp opener ── */
function openWhatsApp(id){
  const c=allCars.find(x=>String(x.id)===String(id));
  if(!c)return;
  window.open(waUrl(waCarMsg(c)),'_blank','noopener');
}

/* ── Card slider ── */
function cardGoTo(id,idx){
  const c=allCars.find(x=>String(x.id)===String(id));
  const imgs=c?getImgs(c):[];if(!imgs.length)return;
  if(!cardState[id])cardState[id]={idx:0};
  cardState[id].idx=((idx%imgs.length)+imgs.length)%imgs.length;
  updateCardSlider(id);
}
function cardPrev(id){const c=allCars.find(x=>String(x.id)===String(id));const imgs=c?getImgs(c):[];if(!imgs.length)return;if(!cardState[id])cardState[id]={idx:0};cardState[id].idx=(cardState[id].idx-1+imgs.length)%imgs.length;updateCardSlider(id);}
function cardNext(id){const c=allCars.find(x=>String(x.id)===String(id));const imgs=c?getImgs(c):[];if(!imgs.length)return;if(!cardState[id])cardState[id]={idx:0};cardState[id].idx=(cardState[id].idx+1)%imgs.length;updateCardSlider(id);}
function updateCardSlider(id){
  const idx=cardState[id]?.idx||0;
  const slider=document.getElementById(`slides-${id}`);
  if(slider)slider.style.transform=`translateX(-${idx*100}%)`;
  const dotsEl=document.getElementById(`dots-${id}`);
  if(dotsEl)dotsEl.querySelectorAll('.card-dot').forEach((d,i)=>d.classList.toggle('active',i===idx));
}
function initCardSwipe(id,total){
  const slider=document.getElementById(`slides-${id}`);
  if(!slider||total<=1)return;
  let startX=0;
  slider.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;},{passive:true});
  slider.addEventListener('touchend',e=>{const diff=startX-e.changedTouches[0].clientX;if(Math.abs(diff)>30)diff>0?cardNext(id):cardPrev(id);},{passive:true});
  slider.addEventListener('touchstart',()=>{
    const card=document.getElementById(`card-${id}`);
    card?.querySelectorAll('.card-nav').forEach(n=>n.classList.add('touch-vis'));
    clearTimeout(slider._navTimer);
    slider._navTimer=setTimeout(()=>card?.querySelectorAll('.card-nav').forEach(n=>n.classList.remove('touch-vis')),2000);
  },{passive:true});
}

/* ── MODAL ── */
function openModal(id){
  const c=allCars.find(x=>String(x.id)===String(id));
  if(!c)return;
  activeCar=c;modalIdx=0;modalImgs=getImgs(c);
  document.getElementById('m-img').innerHTML=buildModalGallery(modalImgs);
  document.getElementById('m-title').textContent=`${c.make} ${c.model}`;
  document.getElementById('m-sub').textContent=[c.year,c.color,c.id?`Ref #${String(c.id).slice(-6)}`:''].filter(Boolean).join(' · ');
  document.getElementById('m-price').textContent=`K ${Number(c.price).toLocaleString('en-ZM')}`;
  document.getElementById('m-desc').textContent=c.description||'Well-maintained vehicle ready for immediate delivery. Contact our team to arrange a test drive or viewing.';
  document.getElementById('m-specs').innerHTML=[{label:'Year',val:c.year||'—'},{label:'Colour',val:c.color||'—'},{label:'Mileage',val:c.mileage?c.mileage.toLocaleString()+' km':'—'}].map(s=>`<div class="spec"><div class="spec-lbl">${s.label}</div><div class="spec-val">${s.val}</div></div>`).join('');
  // WhatsApp button opens WA with car details
  document.getElementById('m-wa').onclick=()=>window.open(waUrl(waCarMsg(c)),'_blank','noopener');
  document.getElementById('m-enquire').onclick=()=>{closeModal();openEnquiryForm(c.id);};
  attachModalSwipe();
  slideshowOn=false;updateSlideshowBtn();
  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeModal(){document.getElementById('modal-overlay').classList.remove('open');stopSlideshow();activeCar=null;document.body.style.overflow='';}

function buildModalGallery(imgs){
  if(!imgs||!imgs.length)return`<div class="modal-hero-ph">🚗</div>`;
  const single=imgs.length<=1;
  const slides=imgs.map((src,i)=>`<div class="gallery-slide" onclick="openZoom(${i})"><img src="${src}" alt="Image ${i+1}" loading="lazy" onerror="this.parentElement.innerHTML='<div style=display:flex;align-items:center;justify-content:center;height:100%;font-size:60px>🚗</div>'"/></div>`).join('');
  const thumbs=!single?`<div class="gallery-thumbs" id="modal-thumbs">${imgs.map((src,i)=>`<div class="gallery-thumb ${i===0?'active':''}" id="mthumb-${i}" onclick="modalGoTo(${i})"><img src="${src}" alt="thumb ${i+1}" loading="lazy"/></div>`).join('')}</div>`:'';
  return`<div class="gallery-wrap"><div class="gallery-main" id="modal-gallery-main"><div class="gallery-slides" id="modal-slides">${slides}</div><button class="gallery-nav prev ${single?'hidden':''}" onclick="modalPrev()">&#8249;</button><button class="gallery-nav next ${single?'hidden':''}" onclick="modalNext()">&#8250;</button>${!single?`<div class="gallery-counter" id="modal-counter">1 / ${imgs.length}</div>`:''} ${!single?`<button class="gallery-slideshow-btn" id="slideshow-btn" onclick="toggleSlideshow()">▶ Slideshow</button>`:''}</div>${thumbs}</div>`;
}
function modalGoTo(idx){modalIdx=((idx%modalImgs.length)+modalImgs.length)%modalImgs.length;updateModalGallery();}
function modalNext(){modalGoTo(modalIdx+1);}
function modalPrev(){modalGoTo(modalIdx-1);}
function updateModalGallery(){
  const slider=document.getElementById('modal-slides');
  if(slider)slider.style.transform=`translateX(-${modalIdx*100}%)`;
  const counter=document.getElementById('modal-counter');
  if(counter)counter.textContent=`${modalIdx+1} / ${modalImgs.length}`;
  document.querySelectorAll('#modal-thumbs .gallery-thumb').forEach((t,i)=>{t.classList.toggle('active',i===modalIdx);if(i===modalIdx)t.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});});
}
function attachModalSwipe(){
  const el=document.getElementById('modal-gallery-main');
  if(!el||modalImgs.length<=1)return;
  let startX=0;
  el.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;},{passive:true});
  el.addEventListener('touchend',e=>{const diff=startX-e.changedTouches[0].clientX;if(Math.abs(diff)>40)diff>0?modalNext():modalPrev();},{passive:true});
}
function toggleSlideshow(){slideshowOn=!slideshowOn;slideshowOn?startSlideshow():stopSlideshow();updateSlideshowBtn();}
function startSlideshow(){stopSlideshow();slideshowTimer=setInterval(()=>modalNext(),2800);}
function stopSlideshow(){if(slideshowTimer){clearInterval(slideshowTimer);slideshowTimer=null;}slideshowOn=false;}
function updateSlideshowBtn(){const btn=document.getElementById('slideshow-btn');if(!btn)return;btn.textContent=slideshowOn?'⏸ Pause':'▶ Slideshow';btn.classList.toggle('on',slideshowOn);}
function openZoom(idx){const src=modalImgs[idx];if(!src)return;document.getElementById('zoom-img').src=src;document.getElementById('zoom-overlay').classList.add('open');}
function closeZoom(){document.getElementById('zoom-overlay').classList.remove('open');}

/* ── ENQUIRY MODAL ── */
function openEnquiryForm(id){
  const c=allCars.find(x=>String(x.id)===String(id));
  if(!c)return;
  enquiryCar=c;
  document.getElementById('enq-car-name').textContent=`${c.make} ${c.model}${c.year?' ('+c.year+')':''}`;
  ['enq-name','enq-phone','enq-email','enq-msg'].forEach(fid=>{const el=document.getElementById(fid);if(el)el.value='';});
  document.getElementById('enquiry-overlay').classList.add('open');
  document.body.style.overflow='hidden';
}
function closeEnquiry(){document.getElementById('enquiry-overlay').classList.remove('open');document.body.style.overflow='';}

async function submitEnquiry(){
  const btn=document.querySelector('#enquiry-overlay .btn-modal-primary');
  const name=document.getElementById('enq-name').value.trim();
  const phone=document.getElementById('enq-phone').value.trim();
  const email=document.getElementById('enq-email').value.trim();
  const msg=document.getElementById('enq-msg').value.trim();
  if(!name)return notify('Please enter your name','Name is required','error');
  if(!phone&&!email)return notify('Contact info required','Add a phone number or email','error');
  if(email&&!/^\S+@\S+\.\S+$/.test(email))return notify('Invalid email','Please enter a valid email address','error');
  btn.disabled=true;btn.textContent='⏳ Sending...';
  try{
    const res=await fetch(`${API}/enquiries`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({carId:enquiryCar.id,carMake:enquiryCar.make,carModel:enquiryCar.model,carYear:enquiryCar.year||null,name,phone:phone||null,email:email||null,message:msg||`Enquiry for ${enquiryCar.make} ${enquiryCar.model}`})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    notify('Enquiry Sent! ✅',`We'll contact you shortly about the ${enquiryCar.make} ${enquiryCar.model}`,'success',5000);
    ['enq-name','enq-phone','enq-email','enq-msg'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    setTimeout(()=>closeEnquiry(),2500);
  }catch(err){
    notify('Failed to send enquiry',err.message||'Please try again','error',5000);
  }finally{
    btn.disabled=false;btn.textContent='📨 Send Enquiry';
  }
}

/* ── PRE-ORDER FORM ── */
async function submitPreOrder(){
  const btn=document.getElementById('po-btn');
  const name=document.getElementById('po-name').value.trim();
  const phone=document.getElementById('po-phone').value.trim();
  const email=document.getElementById('po-email').value.trim();
  const make=document.getElementById('po-make').value.trim();
  const model=document.getElementById('po-model').value.trim();
  const year=document.getElementById('po-year').value.trim();
  const spec=document.getElementById('po-spec').value;
  const color1=document.getElementById('po-color1').value.trim();
  const color2=document.getElementById('po-color2').value.trim();
  const trans=document.getElementById('po-trans').value;
  const budget=document.getElementById('po-budget').value.trim();
  const notes=document.getElementById('po-notes').value.trim();
  if(!name)return notify('Name required','Please enter your full name','error');
  if(!phone)return notify('Phone required','We need your WhatsApp/phone to reach you','error');
  if(!make||!model)return notify('Car details required','Please enter at least a make and model','error');
  btn.disabled=true;btn.textContent='⏳ Sending…';
  try{
    const res=await fetch(`${API}/preorders`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone:phone||null,email:email||null,make,model,year:year||null,spec:spec||null,color1:color1||null,color2:color2||null,transmission:trans||null,budget:budget||null,extraNotes:notes||null})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||'Failed');
    notify('Pre-Order Received! 🎉',`We'll search for your ${make} ${model} and contact you soon`,'success',5000);
    ['po-name','po-phone','po-email','po-make','po-model','po-year','po-color1','po-color2','po-budget','po-notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('po-spec').value='';
    document.getElementById('po-trans').value='';
  }catch(err){
    notify('Failed to send','Please try again or call us directly','error',5000);
    console.error('Pre-order error:',err);
  }finally{
    btn.disabled=false;btn.textContent='✨ Submit Pre-Order Request';
  }
}

/* ── CALL MENU ── */
function toggleCallMenu(){document.getElementById('call-menu').classList.toggle('open');}
document.addEventListener('click',e=>{if(!e.target.closest('.call-dropdown'))document.getElementById('call-menu')?.classList.remove('open');});

/* ── KEYBOARD ── */
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeModal();closeEnquiry();closeZoom();}
  if(e.key==='ArrowRight')modalNext();
  if(e.key==='ArrowLeft')modalPrev();
});

/* ── OVERLAY CLICK-OUTSIDE HANDLERS ── */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('modal-overlay')?.addEventListener('click',function(e){if(e.target===this)closeModal();});
  document.getElementById('enquiry-overlay')?.addEventListener('click',function(e){if(e.target===this)closeEnquiry();});
});

/* ── BOOT ── */
init();
startAutoRefresh();