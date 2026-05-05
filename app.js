/* VendorPro v3 — app.js */
'use strict';

let db;
const DB_NAME='VendorProDB', DB_VER=2, BILLS='bills', PAYMENTS='payments';

// ─── DB ───────────────────────────────────────
function initDB(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open(DB_NAME,DB_VER);
    req.onupgradeneeded=e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains(BILLS)){
        const bs=d.createObjectStore(BILLS,{keyPath:'id',autoIncrement:true});
        bs.createIndex('vendorName','vendorName',{unique:false});
      }
      if(!d.objectStoreNames.contains(PAYMENTS)){
        const ps=d.createObjectStore(PAYMENTS,{keyPath:'id',autoIncrement:true});
        ps.createIndex('vendorName','vendorName',{unique:false});
      }
    };
    req.onsuccess=e=>{db=e.target.result;res();};
    req.onerror=()=>rej(req.error);
  });
}
const dbGetAll=s=>new Promise((r,j)=>{const q=db.transaction(s,'readonly').objectStore(s).getAll();q.onsuccess=()=>r(q.result||[]);q.onerror=()=>j(q.error);});
const dbAdd=(s,o)=>new Promise((r,j)=>{const q=db.transaction(s,'readwrite').objectStore(s).add({...o,createdAt:Date.now()});q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});
const dbPut=(s,o)=>new Promise((r,j)=>{const q=db.transaction(s,'readwrite').objectStore(s).put(o);q.onsuccess=()=>r();q.onerror=()=>j(q.error);});
const dbDel=(s,id)=>new Promise((r,j)=>{const q=db.transaction(s,'readwrite').objectStore(s).delete(id);q.onsuccess=()=>r();q.onerror=()=>j(q.error);});

// ─── NAVIGATION ───────────────────────────────
function navigate(pg){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const pel=document.getElementById('page-'+pg); if(pel) pel.classList.add('active');
  const nel=document.querySelector(`[data-page="${pg}"]`); if(nel) nel.classList.add('active');
  closeSidebar();
  if(pg==='dashboard') loadDashboard();
  else if(pg==='report') loadReport();
  else if(pg==='ledger') initLedgerPage();
  else if(pg==='add-vendor'){ resetAddPage(); setTimeout(setTodayDates,40); }
}

function toggleSidebar(){ document.getElementById('sidebar').classList.toggle('open'); document.getElementById('overlay').classList.toggle('show'); }
function closeSidebar(){ document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('show'); }

// ─── TABS ─────────────────────────────────────
function switchTab(t){
  document.getElementById('tabBill').style.display=t==='bill'?'':'none';
  document.getElementById('tabPay').style.display=t==='pay'?'':'none';
  document.getElementById('tabBillBtn').classList.toggle('active',t==='bill');
  document.getElementById('tabPayBtn').classList.toggle('active',t==='pay');
  if(t==='pay'){populatePayVendor();setTimeout(setTodayDates,40);}
}

function resetAddPage(){
  document.getElementById('formTitle').textContent='Add Bill / Payment';
  document.getElementById('editId').value='';
  document.getElementById('editMode').value='';
  clearBillForm(); clearPayForm(); switchTab('bill');
}

// ─── DATE ─────────────────────────────────────
function syncDate(nId,dispId){
  const val=document.getElementById(nId)?.value;
  if(!val) return;
  const [y,m,d]=val.split('-');
  const txt=`${d}/${m}/${y.slice(-2)}`;
  // update hidden text value
  const hidEl=document.getElementById(dispId==='fDate'?'fDate':'pDate');
  if(hidEl) hidEl.dataset.val=txt;
  // update display span
  const spanId=dispId==='fDate'?'fDateVal':'pDateVal';
  const sp=document.getElementById(spanId);
  if(sp){ sp.textContent=txt; sp.classList.remove('placeholder'); }
}

function getDateVal(dispId){
  // get from dataset
  const el=document.getElementById(dispId);
  return el?el.dataset.val||'':'';
}

function validateDate(d){ return /^\d{2}\/\d{2}\/\d{2}$/.test(d); }

function pad(n){ return String(n).padStart(2,'0'); }
function getTodayDDMMYY(){ const n=new Date(); return `${pad(n.getDate())}/${pad(n.getMonth()+1)}/${String(n.getFullYear()).slice(-2)}`; }
function getTodayNative(){ const n=new Date(); return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}`; }

function setTodayDates(){
  const tn=getTodayNative(); const td=getTodayDDMMYY();
  [['fDateNative','fDate','fDateVal'],['pDateNative','pDate','pDateVal']].forEach(([nId,dId,sId])=>{
    const nEl=document.getElementById(nId);
    const dEl=document.getElementById(dId);
    const sEl=document.getElementById(sId);
    if(nEl&&!nEl.value){ nEl.value=tn; }
    if(dEl&&!dEl.dataset.val){ dEl.dataset.val=td; }
    if(sEl&&(sEl.textContent==='Tap to select'||!sEl.textContent)){ sEl.textContent=td; sEl.classList.remove('placeholder'); }
  });
}

// Allow clicking date display div
document.addEventListener('DOMContentLoaded',()=>{
  ['fDate','pDate'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener('click',()=>{
      const nId=id==='fDate'?'fDateNative':'pDateNative';
      const nEl=document.getElementById(nId);
      if(nEl){ try{ nEl.showPicker(); }catch(e){ nEl.click(); } }
    });
  });
});

// ─── AUTOCOMPLETE ─────────────────────────────
async function vendorAutocomplete(input){
  const val=input.value.toLowerCase().trim();
  const list=document.getElementById('autocompleteList');
  if(!val){list.style.display='none';return;}
  const bills=await dbGetAll(BILLS);
  const vendors=[...new Set(bills.map(b=>b.vendorName))].filter(v=>v.toLowerCase().includes(val));
  if(!vendors.length){list.style.display='none';return;}
  list.innerHTML=vendors.map(v=>`<div class="ac-item" onclick="selectVendor('${v.replace(/'/g,"\\'")}')" >👤 ${v}</div>`).join('');
  list.style.display='block';
  document.addEventListener('click',function cl(e){ if(!e.target.closest('.ac-wrap')){ list.style.display='none'; document.removeEventListener('click',cl); } });
}
async function selectVendor(name){
  document.getElementById('fVendorName').value=name;
  document.getElementById('autocompleteList').style.display='none';
  const bills=await dbGetAll(BILLS);
  const last=[...bills].reverse().find(b=>b.vendorName===name);
  if(last){ if(last.mobile) document.getElementById('fMobile').value=last.mobile; if(last.city) document.getElementById('fCity').value=last.city; }
}

// ─── SAVE BILL ────────────────────────────────
async function saveBill(){
  const editId=document.getElementById('editId').value;
  const editMode=document.getElementById('editMode').value;
  const vendorName=document.getElementById('fVendorName').value.trim();
  const mobile=document.getElementById('fMobile').value.trim();
  const city=document.getElementById('fCity').value.trim();
  const date=getDateVal('fDate');
  const billNo=document.getElementById('fBillNo').value.trim();
  const amount=parseFloat(document.getElementById('fAmount').value);
  const description=document.getElementById('fDescription').value.trim();

  if(!vendorName) return showToast('Vendor name required','error');
  if(!date||!validateDate(date)) return showToast('Date select karein','error');
  if(!billNo) return showToast('Bill No required','error');
  if(!amount||isNaN(amount)||amount<=0) return showToast('Valid amount darj karein','error');

  const obj={vendorName,mobile,city,date,billNo,amount,description};
  try{
    if(editId&&editMode==='bill') await dbPut(BILLS,{...obj,id:parseInt(editId)});
    else await dbAdd(BILLS,obj);
    showToast(editId?'Bill updated ✓':'Bill saved ✓','success');
    clearBillForm(); document.getElementById('editId').value=''; document.getElementById('editMode').value='';
    document.getElementById('formTitle').textContent='Add Bill / Payment';
    updateBadge();
  }catch{ showToast('Error saving','error'); }
}

function clearBillForm(){
  ['fVendorName','fMobile','fCity','fBillNo','fAmount','fDescription'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
  const nEl=document.getElementById('fDateNative'); if(nEl) nEl.value='';
  const dEl=document.getElementById('fDate'); if(dEl) dEl.dataset.val='';
  const sEl=document.getElementById('fDateVal'); if(sEl){ sEl.textContent='Tap to select'; sEl.classList.add('placeholder'); }
  setTimeout(setTodayDates,20);
}

// ─── PAYMENT DROPDOWN ─────────────────────────
async function populatePayVendor(){
  const bills=await dbGetAll(BILLS);
  const vendors=[...new Set(bills.map(b=>b.vendorName))].sort();
  const sel=document.getElementById('pVendor');
  const cur=sel.value;
  sel.innerHTML='<option value="">— Vendor chunein —</option>'+vendors.map(v=>`<option value="${v}" ${v===cur?'selected':''}>${v}</option>`).join('');
  if(cur) loadVendorBillsForPay();
}

async function loadVendorBillsForPay(){
  const vendor=document.getElementById('pVendor').value;
  const ow=document.getElementById('outstandingWrap');
  const br=document.getElementById('pBillRef');
  const bpw=document.getElementById('billPreviewWrap');
  if(!vendor){ow.style.display='none';br.innerHTML='<option value="">— General Payment —</option>';bpw.style.display='none';return;}

  const [bills,payments]=await Promise.all([dbGetAll(BILLS),dbGetAll(PAYMENTS)]);
  const vb=bills.filter(b=>b.vendorName===vendor).sort((a,b)=>dsk(a.date).localeCompare(dsk(b.date)));
  const vp=payments.filter(p=>p.vendorName===vendor);
  const tb=vb.reduce((s,b)=>s+b.amount,0);
  const tp=vp.reduce((s,p)=>s+p.amount,0);
  const bal=tb-tp;

  ow.style.display='';
  document.getElementById('outTotalBill').textContent='PKR '+tb.toLocaleString('en-PK');
  document.getElementById('outTotalPaid').textContent='PKR '+tp.toLocaleString('en-PK');
  const bEl=document.getElementById('outBalance');
  bEl.textContent='PKR '+Math.abs(bal).toLocaleString('en-PK')+(bal<0?' (Overpaid)':'');
  bEl.className='os-val '+(bal>0?'blue':'green');

  br.innerHTML='<option value="">— General Payment —</option>';
  vb.forEach(b=>{
    const paid=payments.filter(p=>p.billId===b.id).reduce((s,p)=>s+p.amount,0);
    const rem=b.amount-paid;
    const ico=rem<=0?'✅':rem<b.amount?'⚡':'🔴';
    br.innerHTML+=`<option value="${b.id}" data-rem="${rem}">${ico} ${b.billNo} | ${b.date} | PKR ${b.amount.toLocaleString('en-PK')} | Baqi: ${Math.max(0,rem).toLocaleString('en-PK')}</option>`;
  });
  bpw.style.display='none';
}

async function billSelected(){
  const billId=parseInt(document.getElementById('pBillRef').value);
  const bpw=document.getElementById('billPreviewWrap');
  if(!billId){bpw.style.display='none';return;}
  const [bills,payments]=await Promise.all([dbGetAll(BILLS),dbGetAll(PAYMENTS)]);
  const b=bills.find(b=>b.id===billId); if(!b){bpw.style.display='none';return;}
  const paid=payments.filter(p=>p.billId===billId).reduce((s,p)=>s+p.amount,0);
  const rem=b.amount-paid;
  document.getElementById('billPreview').innerHTML=`
    <div class="bps-row"><span class="bps-lbl">Bill No</span><span class="bps-val">${b.billNo}</span></div>
    <div class="bps-row"><span class="bps-lbl">Date</span><span class="bps-val">${b.date}</span></div>
    <div class="bps-row"><span class="bps-lbl">Bill Amount</span><span class="bps-val" style="color:#DC2626">PKR ${b.amount.toLocaleString('en-PK')}</span></div>
    <div class="bps-row"><span class="bps-lbl">Paid</span><span class="bps-val" style="color:#059669">PKR ${paid.toLocaleString('en-PK')}</span></div>
    <div class="bps-row" style="width:100%"><span class="bps-lbl">⚡ Baqi</span><span class="bps-val" style="color:#4B5BDA;font-size:16px">PKR ${Math.max(0,rem).toLocaleString('en-PK')}</span></div>`;
  bpw.style.display='';
  if(rem>0) document.getElementById('pAmount').value=rem;
}

function checkPayAmount(){
  const opt=document.getElementById('pBillRef').selectedOptions[0];
  const rem=parseFloat(opt?.dataset.rem||0);
  const entered=parseFloat(document.getElementById('pAmount').value||0);
  const btn=document.querySelector('.btn-pay');
  if(btn&&rem>0&&entered>rem) btn.style.background='linear-gradient(135deg,#F59E0B,#D97706)';
  else if(btn) btn.style.background='';
}

// ─── SAVE PAYMENT ─────────────────────────────
async function savePayment(){
  const editId=document.getElementById('editId').value;
  const editMode=document.getElementById('editMode').value;
  const vendor=document.getElementById('pVendor').value;
  const billRef=document.getElementById('pBillRef').value;
  const date=getDateVal('pDate');
  const amount=parseFloat(document.getElementById('pAmount').value);
  const payment=document.getElementById('pPayment').value;
  const refNo=document.getElementById('pRef').value.trim();
  const note=document.getElementById('pNote').value.trim();

  if(!vendor) return showToast('Vendor select karein','error');
  if(!date||!validateDate(date)) return showToast('Date select karein','error');
  if(!amount||isNaN(amount)||amount<=0) return showToast('Valid amount darj karein','error');
  if(!payment) return showToast('Payment method select karein','error');

  const obj={vendorName:vendor,billId:billRef?parseInt(billRef):null,date,amount,payment,refNo,note};
  try{
    if(editId&&editMode==='payment') await dbPut(PAYMENTS,{...obj,id:parseInt(editId)});
    else await dbAdd(PAYMENTS,obj);
    showToast('Payment saved ✓','success');
    clearPayForm(); document.getElementById('editId').value=''; document.getElementById('editMode').value='';
    updateBadge(); loadVendorBillsForPay();
  }catch{ showToast('Error saving','error'); }
}

function clearPayForm(){
  ['pAmount','pRef','pNote'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
  const pv=document.getElementById('pVendor');if(pv)pv.value='';
  const pp=document.getElementById('pPayment');if(pp)pp.value='';
  const pb=document.getElementById('pBillRef');if(pb)pb.innerHTML='<option value="">— General Payment —</option>';
  const ow=document.getElementById('outstandingWrap');if(ow)ow.style.display='none';
  const bpw=document.getElementById('billPreviewWrap');if(bpw)bpw.style.display='none';
  const nEl=document.getElementById('pDateNative');if(nEl)nEl.value='';
  const dEl=document.getElementById('pDate');if(dEl)dEl.dataset.val='';
  const sEl=document.getElementById('pDateVal');if(sEl){sEl.textContent='Tap to select';sEl.classList.add('placeholder');}
  setTimeout(setTodayDates,20);
}

// ─── DASHBOARD ────────────────────────────────
let _dashData=[];
async function loadDashboard(){
  const [bills,payments]=await Promise.all([dbGetAll(BILLS),dbGetAll(PAYMENTS)]);
  const vendors=[...new Set(bills.map(b=>b.vendorName))];
  const tb=bills.reduce((s,b)=>s+b.amount,0);
  const tp=payments.reduce((s,p)=>s+p.amount,0);

  document.getElementById('statVendors').textContent=vendors.length;
  document.getElementById('statEntries').textContent=bills.length;
  document.getElementById('statAmount').textContent=formatPKR(Math.max(0,tb-tp));
  document.getElementById('statPaid').textContent=formatPKR(tp);

  // Build vendor summary data
  _dashData=vendors.map(v=>{
    const vb=bills.filter(b=>b.vendorName===v);
    const vp=payments.filter(p=>p.vendorName===v);
    const total=vb.reduce((s,b)=>s+b.amount,0);
    const paid=vp.reduce((s,p)=>s+p.amount,0);
    const baqi=total-paid;
    const lastDate=vb.map(b=>dsk(b.date)).sort().reverse()[0]||'000000';
    const lastBill=vb.find(b=>dsk(b.date)===lastDate);
    const city=lastBill?.city||'';
    const mobile=lastBill?.mobile||'';
    const invoices=vb.length;
    const status=baqi<=0?'paid':paid>0?'partial':'unpaid';
    return {name:v,city,mobile,total,paid,baqi,invoices,status,lastDate};
  }).sort((a,b)=>b.lastDate.localeCompare(a.lastDate));

  renderDashCards(_dashData);
  drawPie(payments);
  updateBadge();
}

function filterDashCards(){
  const q=(document.getElementById('dashSearch')?.value||'').toLowerCase();
  const filtered=_dashData.filter(v=>!q||v.name.toLowerCase().includes(q)||(v.city||'').toLowerCase().includes(q));
  renderDashCards(filtered);
}

function renderDashCards(data){
  const el=document.getElementById('vendorCards');
  if(!data.length){el.innerHTML='<div class="empty-card">Koi vendor nahi mila.</div>';return;}
  el.innerHTML=data.map(v=>`
    <div class="vendor-card ${v.status==='paid'?'paid-card':v.status==='partial'?'partial-card':''}" onclick="openLedgerFor('${v.name.replace(/'/g,"\\'")}')">
      <div class="vc-top">
        <div>
          <div class="vc-name">👤 ${v.name}</div>
          <div class="vc-meta">
            ${v.city?`📍 ${v.city}`:''}
            ${v.mobile?`📞 ${v.mobile}`:''}
          </div>
        </div>
        <span class="vc-badge ${v.status==='paid'?'badge-paid':v.status==='partial'?'badge-partial':'badge-unpaid'}">
          ${v.status==='paid'?'PAID':v.status==='partial'?'PARTIAL':'UNPAID'}
        </span>
      </div>
      <div class="vc-stats">
        <div class="vc-stat"><div class="vc-stat-num blue">${v.invoices}</div><div class="vc-stat-lbl">Bills</div></div>
        <div class="vc-stat"><div class="vc-stat-num red">Rs.${v.total.toLocaleString('en-PK')}</div><div class="vc-stat-lbl">Total</div></div>
        <div class="vc-stat"><div class="vc-stat-num green">Rs.${v.paid.toLocaleString('en-PK')}</div><div class="vc-stat-lbl">Paid</div></div>
        <div class="vc-stat"><div class="vc-stat-num gold">Rs.${Math.max(0,v.baqi).toLocaleString('en-PK')}</div><div class="vc-stat-lbl">Baqi</div></div>
      </div>
    </div>`).join('');
}

function openLedgerFor(name){
  navigate('ledger');
  setTimeout(()=>{ document.getElementById('ledgerVendor').value=name; loadLedger(); },60);
}

function drawPie(payments){
  const totals={};
  payments.forEach(p=>{totals[p.payment]=(totals[p.payment]||0)+p.amount;});
  const colors={Cash:'#C8960A',Online:'#6B7BF7',EasyPaisa:'#059669',JazzCash:'#DB2777'};
  const total=Object.values(totals).reduce((a,b)=>a+b,0);
  const cv=document.getElementById('pieCanvas');
  const ctx=cv.getContext('2d');
  ctx.clearRect(0,0,120,120);
  if(!total){document.getElementById('paymentLegend').innerHTML='<div class="empty-sm">No payments yet</div>';return;}
  let st=-Math.PI/2;
  Object.entries(totals).forEach(([m,v])=>{
    const sl=(v/total)*Math.PI*2;
    ctx.beginPath();ctx.moveTo(60,60);ctx.arc(60,60,50,st,st+sl);ctx.closePath();
    ctx.fillStyle=colors[m]||'#999';ctx.fill();
    ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();
    st+=sl;
  });
  ctx.beginPath();ctx.arc(60,60,24,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
  ctx.fillStyle=colors['Online']||'#6B7BF7';ctx.font='bold 9px Outfit';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle='#1A1B3A';ctx.fillText('PKR',60,56);ctx.font='bold 8px JetBrains Mono';ctx.fillText(formatPKR(total),60,66);
  document.getElementById('paymentLegend').innerHTML=Object.entries(totals).map(([m,v])=>
    `<div class="legend-item"><span class="legend-dot" style="background:${colors[m]||'#999'}"></span><span class="legend-lbl">${m}</span><span class="legend-val">${formatPKR(v)}</span></div>`).join('');
}

// ─── REPORT ───────────────────────────────────
let _reportData=[];
async function loadReport(){
  const [bills,payments]=await Promise.all([dbGetAll(BILLS),dbGetAll(PAYMENTS)]);
  _reportData=[...bills.map(b=>({...b,_type:'bill'})),...payments.map(p=>({...p,_type:'payment'}))]
    .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  filterReport();
}

function filterReport(){
  const q=(document.getElementById('searchInput')?.value||'').toLowerCase();
  const ft=document.getElementById('filterType')?.value||'';
  const f=_reportData.filter(e=>{
    const mq=!q||(e.vendorName||'').toLowerCase().includes(q)||(e.billNo||'').toLowerCase().includes(q)||(e.refNo||'').toLowerCase().includes(q);
    const mt=!ft||e._type===ft;
    return mq&&mt;
  });
  document.getElementById('reportCount').textContent=`${f.length} entries`;
  renderReport(f);
}

function renderReport(data){
  const el=document.getElementById('reportList');
  if(!data.length){el.innerHTML='<div class="empty-card">No entries found.</div>';return;}
  el.innerHTML=data.map(e=>e._type==='bill'?`
    <div class="report-card rc-type-bill">
      <div class="rc-hdr">
        <div>
          <span class="rc-badge rc-badge-bill">📋 BILL</span>
          <div class="rc-vendor">${e.vendorName}</div>
          <div class="rc-sub">${e.billNo} &nbsp;•&nbsp; ${e.date} ${e.city?'&nbsp;•&nbsp;'+e.city:''}</div>
        </div>
        <div class="rc-amount debit">-PKR<br>${e.amount.toLocaleString('en-PK')}</div>
      </div>
      <div class="rc-foot">
        <span class="rc-method">${e.description||'—'}</span>
        <div class="rc-actions">
          <button class="btn-edit-sm" onclick="editBill(${e.id})">✎ Edit</button>
          <button class="btn-del-sm" onclick="deleteBill(${e.id})">✕</button>
        </div>
      </div>
    </div>` : `
    <div class="report-card rc-type-pay">
      <div class="rc-hdr">
        <div>
          <span class="rc-badge rc-badge-pay">✅ PAYMENT</span>
          <div class="rc-vendor">${e.vendorName}</div>
          <div class="rc-sub">${e.refNo||'Payment'} &nbsp;•&nbsp; ${e.date}</div>
        </div>
        <div class="rc-amount credit">+PKR<br>${e.amount.toLocaleString('en-PK')}</div>
      </div>
      <div class="rc-foot">
        <span class="rc-method"><span class="pay-badge ${payClass(e.payment)}">${payIcon(e.payment)} ${e.payment}</span> ${e.note||''}</span>
        <div class="rc-actions">
          <button class="btn-edit-sm" onclick="editPayment(${e.id})">✎ Edit</button>
          <button class="btn-del-sm" onclick="deletePayment(${e.id})">✕</button>
        </div>
      </div>
    </div>`).join('');
}

// ─── LEDGER ───────────────────────────────────
async function initLedgerPage(){
  const bills=await dbGetAll(BILLS);
  const vendors=[...new Set(bills.map(b=>b.vendorName))].sort();
  const sel=document.getElementById('ledgerVendor');
  const cur=sel.value;
  sel.innerHTML='<option value="">— Vendor chunein —</option>'+vendors.map(v=>`<option value="${v}" ${v===cur?'selected':''}>${v}</option>`).join('');
  if(cur) loadLedger();
}

async function loadLedger(){
  const vendor=document.getElementById('ledgerVendor').value;
  const el=document.getElementById('ledgerContent');
  if(!vendor){el.innerHTML='<div class="empty-card">Vendor select karein.</div>';return;}

  const [bills,allPay]=await Promise.all([dbGetAll(BILLS),dbGetAll(PAYMENTS)]);
  const vb=bills.filter(b=>b.vendorName===vendor).sort((a,b)=>dsk(a.date).localeCompare(dsk(b.date)));
  const vp=allPay.filter(p=>p.vendorName===vendor).sort((a,b)=>dsk(a.date).localeCompare(dsk(b.date)));

  const tb=vb.reduce((s,b)=>s+b.amount,0);
  const tp=vp.reduce((s,p)=>s+p.amount,0);
  const bal=tb-tp;
  const city=vb[0]?.city||''; const mobile=vb[0]?.mobile||'';

  // Merge & sort
  const rows=[...vb.map(b=>({...b,_type:'bill',_sk:dsk(b.date)+String(b.createdAt||0).padStart(15,'0')})),
              ...vp.map(p=>({...p,_type:'payment',_sk:dsk(p.date)+String(p.createdAt||0).padStart(15,'0')}))];
  rows.sort((a,b)=>a._sk.localeCompare(b._sk));

  let runBal=0; let num=0;
  const rowsHTML=rows.map(r=>{
    num++;
    if(r._type==='bill'){
      runBal-=r.amount;
      const paidForBill=allPay.filter(p=>p.billId===r.id).reduce((s,p)=>s+p.amount,0);
      const rem=r.amount-paidForBill;
      const statusBadge=rem<=0?'<span class="pay-status-sm pss-paid">✅ Paid</span>':rem<r.amount?'<span class="pay-status-sm pss-partial">⚡ Partial</span>':'<span class="pay-status-sm pss-unpaid">🔴 Unpaid</span>';
      return `<div class="ledger-row row-bill">
        <div class="lr-num">${num}</div>
        <div class="lr-body">
          <div class="lr-top"><span class="lr-date">${r.date}</span><span class="lr-bill">${r.billNo}</span></div>
          ${r.description?`<div class="lr-desc">${r.description}</div>`:''}
          <div class="lr-bottom">
            <span class="lr-debit">-PKR ${r.amount.toLocaleString('en-PK')}</span>
            <span class="lr-balance">Bal: PKR ${Math.abs(runBal).toLocaleString('en-PK')} ${runBal<0?'Dr':'Cr'}</span>
          </div>
        </div>
        <div class="lr-actions">
          ${statusBadge}
          <button class="btn-edit-sm" onclick="editBill(${r.id})">✎</button>
          <button class="btn-del-sm" onclick="deleteBill(${r.id},true)">✕</button>
        </div>
      </div>`;
    }else{
      runBal+=r.amount;
      const billLabel=r.billId?(()=>{const b=vb.find(b=>b.id===r.billId);return b?`Against: ${b.billNo}`:''})():'General';
      return `<div class="ledger-row row-pay">
        <div class="lr-num">${num}</div>
        <div class="lr-body">
          <div class="lr-top"><span class="lr-date">${r.date}</span><span class="lr-bill" style="color:#059669">${r.refNo||billLabel||'Payment'}</span></div>
          <div class="lr-desc"><span class="pay-badge ${payClass(r.payment)}">${payIcon(r.payment)} ${r.payment}</span>${r.note?' — '+r.note:''}</div>
          <div class="lr-bottom">
            <span class="lr-credit">+PKR ${r.amount.toLocaleString('en-PK')}</span>
            <span class="lr-balance" style="color:${runBal<0?'#EF4444':'#059669'}">Bal: PKR ${Math.abs(runBal).toLocaleString('en-PK')} ${runBal<0?'Dr':'Cr'}</span>
          </div>
        </div>
        <div class="lr-actions">
          <span class="pay-status-sm pss-paid">✅ Paid</span>
          <button class="btn-edit-sm" onclick="editPayment(${r.id})">✎</button>
          <button class="btn-del-sm" onclick="deletePayment(${r.id},true)">✕</button>
        </div>
      </div>`;
    }
  }).join('');

  el.innerHTML=`
    <div id="khataBlock">
      <div class="khata-header">
        <div class="kh-vendor">📓 ${vendor}</div>
        <div class="kh-meta">${city?'📍 '+city:''}${mobile?'📞 '+mobile:''}</div>
        <div class="kh-stats">
          <div class="kh-stat"><div class="kh-stat-num red">PKR ${tb.toLocaleString('en-PK')}</div><div class="kh-stat-lbl">Total Billed</div></div>
          <div class="kh-stat"><div class="kh-stat-num green">PKR ${tp.toLocaleString('en-PK')}</div><div class="kh-stat-lbl">Total Paid</div></div>
          <div class="kh-stat"><div class="kh-stat-num gold">PKR ${Math.abs(bal).toLocaleString('en-PK')}</div><div class="kh-stat-lbl">Balance</div></div>
        </div>
      </div>
      <div class="khata-body">
        <div class="khata-title-row">
          <span class="khata-title">📋 Khata — Ledger Statement</span>
          <button class="btn-save-img" onclick="saveKhataImage()">📷 Save Image</button>
        </div>
        ${rowsHTML}
        <div class="khata-total-row">
          <span class="ktr-label">Total / Remaining</span>
          <span class="ktr-val">PKR ${Math.abs(bal).toLocaleString('en-PK')}</span>
        </div>
        <div class="khata-final">
          <span class="kf-label">Final Status:</span>
          <span class="kf-amount ${bal>0?'baqi':'clear'}">PKR ${Math.abs(bal).toLocaleString('en-PK')} ${bal>0?'BAQI':'CLEAR ✅'}</span>
        </div>
      </div>
    </div>`;
}

// Save khata as image
async function saveKhataImage(){
  const el=document.getElementById('khataBlock');
  if(!el){showToast('Ledger not loaded','error');return;}
  showToast('Image bana raha hai...','info');
  try{
    const canvas=await html2canvas(el,{scale:2,backgroundColor:'#F2F3FA',useCORS:true,logging:false});
    const link=document.createElement('a');
    const vendor=document.getElementById('ledgerVendor').value||'Ledger';
    const today=getTodayDDMMYY().replace(/\//g,'');
    link.download=`Khata_${vendor.replace(/\s/g,'_')}_${today}.png`;
    link.href=canvas.toDataURL('image/png');
    document.body.appendChild(link);link.click();document.body.removeChild(link);
    showToast('Image saved! ✓','success');
  }catch(e){ console.error(e); showToast('Image save failed','error'); }
}

// Open payment from ledger
function openPaymentForVendor(){
  const vendor=document.getElementById('ledgerVendor').value;
  navigate('add-vendor');
  setTimeout(async()=>{ switchTab('pay'); await populatePayVendor(); if(vendor){document.getElementById('pVendor').value=vendor;await loadVendorBillsForPay();}},80);
}

// ─── EDIT / DELETE ────────────────────────────
async function editBill(id){
  const bills=await dbGetAll(BILLS);
  const b=bills.find(b=>b.id===id); if(!b)return;
  navigate('add-vendor');
  setTimeout(()=>{
    switchTab('bill');
    document.getElementById('formTitle').textContent='Edit Bill';
    document.getElementById('editId').value=id;
    document.getElementById('editMode').value='bill';
    document.getElementById('fVendorName').value=b.vendorName;
    document.getElementById('fMobile').value=b.mobile||'';
    document.getElementById('fCity').value=b.city||'';
    document.getElementById('fBillNo').value=b.billNo;
    document.getElementById('fAmount').value=b.amount;
    document.getElementById('fDescription').value=b.description||'';
    // set date
    if(b.date&&validateDate(b.date)){
      const [dd,mm,yy]=b.date.split('/');
      const nEl=document.getElementById('fDateNative');
      if(nEl) nEl.value=`20${yy}-${mm}-${dd}`;
      const dEl=document.getElementById('fDate'); if(dEl) dEl.dataset.val=b.date;
      const sEl=document.getElementById('fDateVal'); if(sEl){sEl.textContent=b.date;sEl.classList.remove('placeholder');}
    }
  },60);
}

async function editPayment(id){
  const payments=await dbGetAll(PAYMENTS);
  const p=payments.find(p=>p.id===id); if(!p)return;
  navigate('add-vendor');
  setTimeout(async()=>{
    switchTab('pay'); await populatePayVendor();
    document.getElementById('formTitle').textContent='Edit Payment';
    document.getElementById('editId').value=id;
    document.getElementById('editMode').value='payment';
    document.getElementById('pVendor').value=p.vendorName;
    await loadVendorBillsForPay();
    if(p.billId) document.getElementById('pBillRef').value=p.billId;
    document.getElementById('pAmount').value=p.amount;
    document.getElementById('pPayment').value=p.payment;
    document.getElementById('pRef').value=p.refNo||'';
    document.getElementById('pNote').value=p.note||'';
    if(p.date&&validateDate(p.date)){
      const [dd,mm,yy]=p.date.split('/');
      const nEl=document.getElementById('pDateNative'); if(nEl) nEl.value=`20${yy}-${mm}-${dd}`;
      const dEl=document.getElementById('pDate'); if(dEl) dEl.dataset.val=p.date;
      const sEl=document.getElementById('pDateVal'); if(sEl){sEl.textContent=p.date;sEl.classList.remove('placeholder');}
    }
  },60);
}

async function deleteBill(id,fromLedger=false){
  const payments=await dbGetAll(PAYMENTS);
  const linked=payments.filter(p=>p.billId===id);
  let msg='Is bill ko delete karein?';
  if(linked.length) msg+=`\n\n⚠ ${linked.length} linked payment(s) bhi delete hongi.`;
  if(!confirm(msg))return;
  if(linked.length) await Promise.all(linked.map(p=>dbDel(PAYMENTS,p.id)));
  await dbDel(BILLS,id);
  showToast('Bill deleted','info');
  updateBadge();
  if(fromLedger)loadLedger();else loadReport();
  loadDashboard();
}

function deletePayment(id,fromLedger=false){
  if(!confirm('Payment delete karein?'))return;
  dbDel(PAYMENTS,id).then(()=>{ showToast('Payment deleted','info'); updateBadge(); if(fromLedger)loadLedger();else loadReport(); loadDashboard(); });
}

// ─── DOWNLOAD ─────────────────────────────────
async function downloadReport(){
  const [bills,payments]=await Promise.all([dbGetAll(BILLS),dbGetAll(PAYMENTS)]);
  const today=getTodayDDMMYY();
  const rows=[...bills.map(b=>`<tr><td>📋 Bill</td><td>${b.vendorName}</td><td>${b.billNo}</td><td>${b.date}</td><td style="color:#DC2626;font-weight:700">PKR ${b.amount.toLocaleString('en-PK')}</td><td>—</td><td>—</td><td>${b.description||'—'}</td></tr>`),
              ...payments.map(p=>`<tr style="background:#F0FDF4"><td>✅ Pay</td><td>${p.vendorName}</td><td>${p.refNo||'—'}</td><td>${p.date}</td><td>—</td><td style="color:#059669;font-weight:700">PKR ${p.amount.toLocaleString('en-PK')}</td><td>${p.payment}</td><td>${p.note||'—'}</td></tr>`)].join('');
  const table=`<table><thead><tr><th>Type</th><th>Vendor</th><th>Bill/Ref</th><th>Date</th><th>Debit</th><th>Credit</th><th>Method</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>`;
  triggerDL(buildHTML('All Vendor Report',today,table),`VendorPro_Report_${today.replace(/\//g,'')}.html`);
}

async function downloadLedger(){
  const vendor=document.getElementById('ledgerVendor').value;
  if(!vendor){showToast('Vendor select karein','error');return;}
  const [bills,allPay]=await Promise.all([dbGetAll(BILLS),dbGetAll(PAYMENTS)]);
  const vb=bills.filter(b=>b.vendorName===vendor).sort((a,b)=>dsk(a.date).localeCompare(dsk(b.date)));
  const vp=allPay.filter(p=>p.vendorName===vendor).sort((a,b)=>dsk(a.date).localeCompare(dsk(b.date)));
  const rows=[...vb.map(b=>({...b,_type:'bill',_sk:dsk(b.date)+(b.createdAt||0)})),...vp.map(p=>({...p,_type:'payment',_sk:dsk(p.date)+(p.createdAt||0)}))];
  rows.sort((a,b)=>String(a._sk).localeCompare(String(b._sk)));
  let bal=0;
  const tRows=rows.map(r=>{
    const d=r._type==='bill'?r.amount:0; const c=r._type==='payment'?r.amount:0;
    bal+=c-d;
    return `<tr style="${r._type==='payment'?'background:#F0FDF4':''}"><td>${r.date}</td><td>${r._type==='bill'?r.billNo:(r.refNo||'—')}</td><td>${r._type==='bill'?(r.description||'—'):(r.note||'—')}</td><td>${r._type==='payment'?r.payment:'—'}</td><td style="color:#DC2626;font-weight:700">${d>0?'PKR '+d.toLocaleString('en-PK'):'—'}</td><td style="color:#059669;font-weight:700">${c>0?'PKR '+c.toLocaleString('en-PK'):'—'}</td><td style="color:${bal<0?'#DC2626':'#4B5BDA'};font-weight:700">PKR ${Math.abs(bal).toLocaleString('en-PK')} ${bal<0?'(Dr)':'(Cr)'}</td></tr>`;
  }).join('');
  const table=`<table><thead><tr><th>Date</th><th>Bill/Ref</th><th>Description</th><th>Payment</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${tRows}</tbody></table>`;
  const today=getTodayDDMMYY();
  triggerDL(buildHTML(`Ledger — ${vendor}`,today,table),`Ledger_${vendor.replace(/\s/g,'_')}_${today.replace(/\//g,'')}.html`);
}

function buildHTML(title,date,table){
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:'Segoe UI',sans-serif;padding:28px;color:#1A1B3A}h1{font-size:20px;font-weight:800;color:#4B5BDA;margin-bottom:4px}.meta{font-size:11px;color:#888;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:12px}thead{background:#1E1F3A;color:#fff}th{padding:9px 10px;text-align:left;font-weight:600}td{padding:8px 10px;border-bottom:1px solid #E2E4F0}tr:nth-child(even){background:#F4F5FF}.footer{margin-top:24px;font-size:10px;color:#aaa;text-align:center}</style></head>
<body><h1>VendorPro — ${title}</h1><div class="meta">Generated: ${date} | VendorPro Management Suite</div>${table}
<div class="footer">© VendorPro Management Suite</div></body></html>`;
}

function triggerDL(html,filename){
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  if(window.showSaveFilePicker){
    window.showSaveFilePicker({suggestedName:filename,types:[{description:'HTML',accept:{'text/html':['.html']}}]})
      .then(async fh=>{const w=await fh.createWritable();await w.write(blob);await w.close();showToast('File saved!','success');})
      .catch(()=>fallbackDL(blob,filename));
  }else fallbackDL(blob,filename);
}
function fallbackDL(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);showToast('Downloaded!','success');
}

// ─── UTILS ────────────────────────────────────
function formatPKR(n){ if(n>=100000)return(n/100000).toFixed(1)+'L'; if(n>=1000)return(n/1000).toFixed(1)+'K'; return n.toLocaleString('en-PK'); }
function payClass(p){ return {Cash:'pb-cash',Online:'pb-online',EasyPaisa:'pb-easypaisa',JazzCash:'pb-jazzcash'}[p]||''; }
function payIcon(p){ return {Cash:'💵',Online:'🌐',EasyPaisa:'📱',JazzCash:'📲'}[p]||'💳'; }
function dsk(d){ if(!d)return'000000'; const [dd,mm,yy]=d.split('/'); return `${yy||'00'}${mm||'00'}${dd||'00'}`; }
function showToast(msg,type=''){ const t=document.getElementById('toast'); t.textContent=msg; t.className=`toast ${type} show`; setTimeout(()=>t.classList.remove('show'),3000); }
async function updateBadge(){ const [b,p]=await Promise.all([dbGetAll(BILLS),dbGetAll(PAYMENTS)]); document.getElementById('mobileBadge').textContent=b.length+p.length; }

// ─── INIT ─────────────────────────────────────
initDB().then(()=>{
  loadDashboard();
  updateBadge();
  document.getElementById('dbStatus').textContent='Database Ready';
}).catch(e=>{ console.error(e); document.getElementById('dbStatus').textContent='⚠ DB Error'; });
