/* VendorPro v2 — app.js — PIN Lock + Secret Q + Folder Picker */
'use strict';

// ============================================================
//  IndexedDB — PIN & Secret Q (separate store from app data)
// ============================================================
const PIN_IDB = 'VendorProSecurity', PIN_STORE = 'secdata';
let pinIdb = null;

function openPinIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(PIN_IDB, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(PIN_STORE);
    req.onsuccess = e => { pinIdb = e.target.result; res(pinIdb); };
    req.onerror = () => rej(req.error);
  });
}
const pinSave = (k, v) => new Promise(res => {
  if (!pinIdb) { res(); return; }
  const tx = pinIdb.transaction(PIN_STORE, 'readwrite');
  tx.objectStore(PIN_STORE).put(v, k);
  tx.oncomplete = () => res(); tx.onerror = () => res();
});
const pinLoad = (k) => new Promise(res => {
  if (!pinIdb) { res(null); return; }
  const tx = pinIdb.transaction(PIN_STORE, 'readonly');
  const req = tx.objectStore(PIN_STORE).get(k);
  req.onsuccess = () => res(req.result !== undefined ? req.result : null);
  req.onerror = () => res(null);
});

async function getPin() { const p = await pinLoad('pin'); return p || localStorage.getItem('vp_pin') || '1234'; }
async function savePin(pin) { await pinSave('pin', pin); try { localStorage.setItem('vp_pin', pin); } catch(e) {} }
async function saveSQData(q, a) {
  const d = JSON.stringify({ q, a: a.toLowerCase().trim() });
  await pinSave('secret_q', d);
  try { localStorage.setItem('vp_sq', d); } catch(e) {}
}
async function loadSQData() {
  const raw = await pinLoad('secret_q') || localStorage.getItem('vp_sq');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch(e) { return null; }
}

async function saveSQ() {
  const q = document.getElementById('sq-select').value;
  const a = document.getElementById('sq-answer').value.trim();
  if (!q) { showToast('Sawaal chunein!', 'error'); return; }
  if (!a || a.length < 2) { showToast('Jawab likhein!', 'error'); return; }
  await saveSQData(q, a);
  document.getElementById('sq-answer').value = '';
  document.getElementById('sq-form').style.display = 'none';
  showToast('Secret question save ho gaya! ✓', 'success');
  updateSQStatus();
}
async function updateSQStatus() {
  const d = await loadSQData();
  const el = document.getElementById('sq-status-desc');
  if (el) el.innerHTML = d ? '✅ Set: <b>' + d.q + '</b>' : '⚠️ Set nahi';
}
function toggleSQForm() {
  const f = document.getElementById('sq-form');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

// ============================================================
//  PIN LOGIC
// ============================================================
let pinBuf = '', pinMode = 'enter', newPinTmp = '';

async function pinPress(k) {
  if (k === 'C') pinBuf = '';
  else if (k === 'DEL') pinBuf = pinBuf.slice(0, -1);
  else if (pinBuf.length < 4) pinBuf += k;
  updDots();
  document.getElementById('pin-error').textContent = '';
  if (pinBuf.length === 4) {
    const cur = await getPin();
    setTimeout(async () => {
      if (pinMode === 'enter') {
        if (pinBuf === cur) {
          document.getElementById('lock-screen').classList.add('hidden');
          await appStart();
        } else {
          document.getElementById('pin-error').textContent = '❌ Galat PIN!';
          pinBuf = ''; updDots();
        }
      } else if (pinMode === 'set-new') {
        newPinTmp = pinBuf; pinBuf = ''; pinMode = 'confirm-new';
        document.getElementById('pin-mode-label').textContent = 'CONFIRM NEW PIN';
        updDots();
      } else if (pinMode === 'confirm-new') {
        if (pinBuf === newPinTmp) {
          await savePin(pinBuf);
          const e = document.getElementById('pin-error');
          e.style.color = '#C6F135'; e.textContent = '✅ PIN saved!';
          setTimeout(() => {
            pinMode = 'enter'; pinBuf = '';
            document.getElementById('pin-mode-label').textContent = 'ENTER PIN';
            e.style.color = '#C6F135'; e.textContent = ''; updDots();
            document.getElementById('lock-screen').classList.add('hidden');
          }, 1200);
        } else {
          document.getElementById('pin-error').textContent = '❌ PINs match nahi!';
          pinMode = 'set-new'; pinBuf = '';
          document.getElementById('pin-mode-label').textContent = 'SET NEW PIN';
          updDots();
        }
      }
    }, 150);
  }
}

function updDots() {
  for (let i = 0; i < 4; i++)
    document.getElementById('dot' + i).classList.toggle('filled', i < pinBuf.length);
}

function startChangePin() {
  pinMode = 'set-new'; pinBuf = ''; newPinTmp = '';
  document.getElementById('pin-mode-label').textContent = 'SET NEW PIN';
  document.getElementById('pin-error').textContent = ''; updDots();
}

function lockApp() {
  pinMode = 'enter'; pinBuf = '';
  document.getElementById('pin-mode-label').textContent = 'ENTER PIN';
  document.getElementById('pin-error').textContent = '';
  document.getElementById('pin-error').style.color = '#C6F135';
  updDots();
  document.getElementById('lock-screen').classList.remove('hidden');
  document.getElementById('forgot-pin-section').style.display = 'none';
  document.getElementById('pin-entry-ui').style.display = 'flex';
}

// ============================================================
//  FORGOT PIN
// ============================================================
async function showForgotPin() {
  const d = await loadSQData();
  if (!d) { showToast('Secret question set nahi — Settings mein set karein!', 'error'); return; }
  document.getElementById('pin-entry-ui').style.display = 'none';
  document.getElementById('forgot-pin-section').style.display = 'block';
  document.getElementById('fp-question-display').textContent = '❓ ' + d.q;
  document.getElementById('fp-answer').value = '';
  document.getElementById('fp-error').textContent = '';
}
function hideForgotPin() {
  document.getElementById('forgot-pin-section').style.display = 'none';
  document.getElementById('pin-entry-ui').style.display = 'flex';
}
async function verifyForgotPin() {
  const d = await loadSQData();
  const ans = document.getElementById('fp-answer').value.trim().toLowerCase();
  const errEl = document.getElementById('fp-error');
  if (!ans) { errEl.textContent = '⚠️ Jawab likhein!'; return; }
  if (!d) { errEl.textContent = '❌ Question nahi mila!'; return; }
  if (ans === d.a || d.a.includes(ans) || ans.includes(d.a)) {
    errEl.style.color = '#C6F135'; errEl.textContent = '✅ Sahi jawab!';
    setTimeout(() => {
      hideForgotPin();
      setTimeout(() => {
        document.getElementById('pin-mode-label').textContent = 'SET NEW PIN';
        document.getElementById('pin-error').style.color = '#C6F135';
        document.getElementById('pin-error').textContent = '🔓 Naya PIN set karein';
        pinMode = 'set-new'; pinBuf = ''; newPinTmp = ''; updDots();
      }, 200);
    }, 600);
  } else {
    errEl.style.color = '#C6F135'; errEl.textContent = '❌ Jawab galat!';
  }
}

// ============================================================
//  FOLDER PICKER
// ============================================================
let _fpBlob = null, _fpFilename = null;

function openFolderPicker(title, sub, blob, filename) {
  _fpBlob = blob; _fpFilename = filename;
  document.getElementById('fp-modal-title').textContent = title || '📁 Kahan Save Karein?';
  document.getElementById('fp-modal-sub').textContent = sub || '';
  document.getElementById('folder-picker-modal').classList.add('open');
}
function closeFolderPicker() {
  document.getElementById('folder-picker-modal').classList.remove('open');
  _fpBlob = null; _fpFilename = null;
}
function folderPickerAction(action) {
  const blob = _fpBlob; const fname = _fpFilename;
  closeFolderPicker();
  if (!blob) { showToast('File nahi mili', 'error'); return; }
  if (action === 'download') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = fname;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
    showToast('✅ Downloads mein save!', 'success');
  } else if (action === 'share') {
    const file = new File([blob], fname, { type: blob.type });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'VendorPro' }).catch(e => { if (e.name !== 'AbortError') showToast('Share error', 'error'); });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = fname;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
    }
  }
}

// ============================================================
//  EXPORT / IMPORT ALL DATA
// ============================================================
async function exportAllData() {
  const [bills, payments] = await Promise.all([dbGetAll(BILLS), dbGetAll(PAYMENTS)]);
  const data = { version: 2, exported: new Date().toISOString(), bills, payments };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const fname = `VendorPro_Backup_${new Date().toISOString().split('T')[0]}.json`;
  openFolderPicker('💾 Backup Kahan Save?', 'JSON backup file', blob, fname);
}

function importAllData(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.bills || !data.payments) throw new Error('Invalid file');
      if (!confirm('Import will ADD to existing data. Continue?')) return;
      for (const b of data.bills) {
        const { id, ...rest } = b;
        await dbAdd(BILLS, rest);
      }
      for (const p of data.payments) {
        const { id, ...rest } = p;
        await dbAdd(PAYMENTS, rest);
      }
      showToast('✅ Data imported!', 'success');
      loadDashboard(); updateBadge();
    } catch(err) { showToast('❌ Import failed: ' + err.message, 'error'); }
    event.target.value = '';
  };
  reader.readAsText(file);
}

// ============================================================
//  OFFLINE BAR
// ============================================================
(function() {
  const bar = document.getElementById('offline-bar');
  function upd() { bar.style.display = navigator.onLine ? 'none' : 'block'; }
  window.addEventListener('online', upd);
  window.addEventListener('offline', upd);
  upd();
})();

// ============================================================
//  SERVICE WORKER
// ============================================================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

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
  if(pg==='settings'){
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    const pel=document.getElementById('page-settings'); if(pel) pel.classList.add('active');
    const nel=document.querySelector('[data-page="settings"]'); if(nel) nel.classList.add('active');
    closeSidebar(); updateSQStatus(); return;
  }
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
  const vp=allPay.filter(p=>p.vendorName===vendor);

  const tb=vb.reduce((s,b)=>s+b.amount,0);
  const tp=vp.reduce((s,p)=>s+p.amount,0);
  const bal=tb-tp;

  // Get vendor info from latest bill
  const lastBill=[...vb].reverse()[0];
  const city=lastBill?.city||'';
  const mobile=lastBill?.mobile||'';

  // Merge & sort all rows
  const rows=[
    ...vb.map(b=>({...b,_type:'bill',_sk:dsk(b.date)+String(b.createdAt||0).padStart(15,'0')})),
    ...vp.map(p=>({...p,_type:'payment',_sk:dsk(p.date)+String(p.createdAt||0).padStart(15,'0')}))
  ];
  rows.sort((a,b)=>a._sk.localeCompare(b._sk));

  // Build table rows (FGI style)
  let runBal=0; let num=0;
  const tableRows=rows.map(r=>{
    num++;
    const isPay=r._type==='payment';
    if(isPay) runBal+=r.amount; else runBal-=r.amount;

    const particulars=isPay
      ? `<span class="part-pay-icon">${payIcon(r.payment)}</span>
         <span class="part-method">${r.payment}</span>
         <span class="part-tag pay-tag">PAY</span>
         ${r.billId?(()=>{const b=vb.find(b=>b.id===r.billId);return b?`<span class="part-ref">vs ${b.billNo}</span>`:''})():''}
         ${r.refNo?`<small style="color:#888;display:block;margin-top:2px">${r.refNo}</small>`:''}
         ${r.note?`<small style="color:#888;display:block">${r.note}</small>`:''}`
      : `<span class="part-billno">${r.billNo}</span>
         <span class="part-tag inv-tag">INV</span>
         ${r.description?`<small style="color:#888;display:block;margin-top:2px">${r.description}</small>`:''}`;

    const paidCell=isPay?`<span class="cell-paid">Rs. ${r.amount.toLocaleString('en-PK')}</span>`:`<span class="cell-dash">—</span>`;
    const billedCell=!isPay?`<span class="cell-billed">Rs. ${r.amount.toLocaleString('en-PK')}</span>`:`<span class="cell-dash">—</span>`;

    // Bill status for bill rows
    let balCell='';
    if(!isPay){
      const paidForBill=allPay.filter(p=>p.billId===r.id).reduce((s,p)=>s+p.amount,0);
      const rem=r.amount-paidForBill;
      balCell=rem<=0
        ? `<span class="cell-bal-clear">✅ Clear</span>`
        : `<span class="cell-bal-due">Rs. ${Math.abs(runBal).toLocaleString('en-PK')}</span>`;
    }else{
      balCell=runBal<=0
        ? `<span class="cell-bal-clear">✅ Clear</span>`
        : `<span class="cell-bal-due">Rs. ${Math.abs(runBal).toLocaleString('en-PK')}</span>`;
    }

    return `<tr class="${isPay?'tr-pay':'tr-bill'}">
      <td class="td-num">${num}</td>
      <td class="td-date">${r.date}</td>
      <td class="td-part">${particulars}</td>
      <td class="td-paid">${paidCell}</td>
      <td class="td-billed">${billedCell}</td>
      <td class="td-bal">${balCell}</td>
      <td class="td-act">
        <button class="btn-edit-sm" onclick="${isPay?'editPayment':'editBill'}(${r.id})">✎</button>
        <button class="btn-del-sm" onclick="${isPay?'deletePayment':'deleteBill'}(${r.id},true)">✕</button>
      </td>
    </tr>`;
  }).join('');

  // Payment methods breakdown
  const methodTotals={};
  vp.forEach(p=>{ methodTotals[p.payment]=(methodTotals[p.payment]||0)+p.amount; });
  const payDetailsHTML=Object.entries(methodTotals).map(([m,v])=>`
    <div class="pd-item">
      <div class="pd-icon">${payIcon(m)}</div>
      <div class="pd-name">${m}</div>
      <div class="pd-amt">Rs. ${v.toLocaleString('en-PK')}</div>
    </div>`).join('') || '<div style="color:#888;font-size:13px;padding:12px">Koi payment nahi</div>';

  const today=getTodayDDMMYY();

  el.innerHTML=`
  <div id="khataBlock" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.12)">

    <!-- TOP HEADER -->
    <div class="kh2-header">
      <div class="kh2-left">
        <div class="kh2-vendor">📓 ${vendor}</div>
        <div class="kh2-meta">
          ${mobile?`📞 ${mobile}`:''}
          ${city?`&nbsp;&nbsp;📍 ${city}`:''}
        </div>
      </div>
      <div class="kh2-right">
        <div class="kh2-badge">KHATA</div>
        <div class="kh2-date">📅 ${today}</div>
      </div>
    </div>

    <!-- 3 STATS -->
    <div class="kh2-stats">
      <div class="kh2-stat">
        <div class="kh2-stat-num red">Rs. ${tb.toLocaleString('en-PK')}</div>
        <div class="kh2-stat-lbl">TOTAL BILLED</div>
      </div>
      <div class="kh2-stat" style="border-left:1px solid rgba(255,255,255,0.1);border-right:1px solid rgba(255,255,255,0.1)">
        <div class="kh2-stat-num green">Rs. ${tp.toLocaleString('en-PK')}</div>
        <div class="kh2-stat-lbl">TOTAL PAID</div>
      </div>
      <div class="kh2-stat">
        <div class="kh2-stat-num gold">Rs. ${Math.abs(bal).toLocaleString('en-PK')}</div>
        <div class="kh2-stat-lbl">BALANCE</div>
      </div>
    </div>

    <!-- KHATA TABLE -->
    <div class="kh2-table-wrap">
      <div class="kh2-table-header">
        <span class="kh2-table-title">📋 KHATA — LEDGER STATEMENT</span>
        <button class="btn-save-img" onclick="saveKhataImage()">📷 Save Image</button>
      </div>
      <div style="overflow-x:auto">
        <table class="kh2-table">
          <thead>
            <tr>
              <th>#</th>
              <th>DATE</th>
              <th>PARTICULARS</th>
              <th>PAID<br><small>(IN)</small></th>
              <th>BILLED<br><small>(OUT)</small></th>
              <th>BALANCE</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${tableRows||'<tr><td colspan="7" style="text-align:center;padding:20px;color:#888">Koi entry nahi</td></tr>'}</tbody>
        </table>
      </div>

      <!-- TOTAL ROW -->
      <div class="kh2-total-row">
        <div class="kh2-total-label">TOTAL / REMAINING</div>
        <div class="kh2-total-vals">
          <span class="kh2-tv-paid">Rs. ${tp.toLocaleString('en-PK')}</span>
          <span class="kh2-tv-billed">Rs. ${tb.toLocaleString('en-PK')}</span>
          <span class="kh2-tv-bal">Rs. ${Math.abs(bal).toLocaleString('en-PK')}</span>
        </div>
      </div>

      <!-- FINAL STATUS -->
      <div class="kh2-final">
        <span class="kh2-final-label">FINAL STATUS</span>
        <span class="kh2-final-amount ${bal>0?'':'kh2-clear'}">
          Rs. ${Math.abs(bal).toLocaleString('en-PK')} ${bal>0?'BAQI':'CLEAR ✅'}
        </span>
      </div>
    </div>

    <!-- PAYMENT DETAILS -->
    <div class="kh2-pd-section">
      <div class="kh2-pd-title">PAYMENT DETAILS</div>
      <div class="kh2-pd-grid">${payDetailsHTML}</div>
      <div class="kh2-footer">${vendor} &nbsp;•&nbsp; Khata: ${vendor} &nbsp;•&nbsp; ${today}</div>
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

function triggerDL(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  openFolderPicker('📄 Report Save?', 'HTML report file', blob, filename);
}
function fallbackDL(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── UTILS ────────────────────────────────────
function formatPKR(n){ if(n>=100000)return(n/100000).toFixed(1)+'L'; if(n>=1000)return(n/1000).toFixed(1)+'K'; return n.toLocaleString('en-PK'); }
function payClass(p){ return {Cash:'pb-cash',Online:'pb-online',EasyPaisa:'pb-easypaisa',JazzCash:'pb-jazzcash'}[p]||''; }
function payIcon(p){ return {Cash:'💵',Online:'🌐',EasyPaisa:'📱',JazzCash:'📲'}[p]||'💳'; }
function dsk(d){ if(!d)return'000000'; const [dd,mm,yy]=d.split('/'); return `${yy||'00'}${mm||'00'}${dd||'00'}`; }
function showToast(msg,type=''){ const t=document.getElementById('toast'); t.textContent=msg; t.className=`toast ${type} show`; setTimeout(()=>t.classList.remove('show'),3000); }
async function updateBadge(){ const [b,p]=await Promise.all([dbGetAll(BILLS),dbGetAll(PAYMENTS)]); document.getElementById('mobileBadge').textContent=b.length+p.length; }

// ─── INIT ─────────────────────────────────────
async function appStart() {
  await initDB();
  loadDashboard();
  updateBadge();
  const dbEl = document.getElementById('dbStatus');
  if (dbEl) dbEl.textContent = 'Database Ready';
  updateSQStatus();
}

// Add settings nav
const origNavigate = navigate;
window._navigate = navigate;

// Override saveKhataImage to use Folder Picker
async function saveKhataImage(){
  const el=document.getElementById('khataBlock');
  if(!el){showToast('Ledger not loaded','error');return;}
  showToast('Image bana raha hai...','info');
  try{
    const canvas=await html2canvas(el,{scale:2,backgroundColor:'#F2F3FA',useCORS:true,logging:false});
    const vendor=document.getElementById('ledgerVendor').value||'Ledger';
    const today=getTodayDDMMYY().replace(/\//g,'');
    const fname=`Khata_${vendor.replace(/\s/g,'_')}_${today}.png`;
    canvas.toBlob(blob=>{
      openFolderPicker('📷 Khata Image Save?','Kahan save karein?',blob,fname);
    },'image/png',1.0);
  }catch(e){ console.error(e); showToast('Image save failed','error'); }
}

// Start app — open PIN IDB then show PIN screen
openPinIDB().then(() => {
  // PIN screen already visible — wait for user
}).catch(e => console.log('PIN IDB error:', e));

