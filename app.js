/* ============================================
   VendorPro — app.js v2.0
   Two stores: 'bills' + 'payments'
   Ledger auto-fetches bills, payments deduct balance
   ============================================ */
'use strict';

let db;
const DB_NAME  = 'VendorProDB';
const DB_VER   = 2;
const BILLS    = 'bills';
const PAYMENTS = 'payments';

// ===========================
// DATABASE
// ===========================
function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);

    req.onupgradeneeded = e => {
      const d = e.target.result;

      // Bills store
      if (!d.objectStoreNames.contains(BILLS)) {
        const bs = d.createObjectStore(BILLS, { keyPath: 'id', autoIncrement: true });
        bs.createIndex('vendorName', 'vendorName', { unique: false });
        bs.createIndex('date', 'date', { unique: false });
      }

      // Payments store
      if (!d.objectStoreNames.contains(PAYMENTS)) {
        const ps = d.createObjectStore(PAYMENTS, { keyPath: 'id', autoIncrement: true });
        ps.createIndex('vendorName', 'vendorName', { unique: false });
        ps.createIndex('billId', 'billId', { unique: false });
      }

      // Migrate old single-store entries if upgrading from v1
      if (e.oldVersion === 1 && d.objectStoreNames.contains('entries')) {
        const oldStore = e.target.transaction.objectStore('entries');
        const getAllOld = oldStore.getAll();
        getAllOld.onsuccess = () => {
          const items = getAllOld.result || [];
          items.forEach(item => {
            if (item.type === 'Debit') {
              d.transaction(BILLS,'readwrite').objectStore(BILLS).add({
                vendorName: item.vendorName, mobile: item.mobile||'', city: item.city||'',
                date: item.date, billNo: item.billNo, amount: item.amount,
                description: item.description||'', createdAt: item.createdAt||Date.now()
              });
            } else {
              d.transaction(PAYMENTS,'readwrite').objectStore(PAYMENTS).add({
                vendorName: item.vendorName, date: item.date, amount: item.amount,
                payment: item.payment, billId: null, refNo: item.billNo||'',
                note: item.description||'', createdAt: item.createdAt||Date.now()
              });
            }
          });
        };
      }
    };

    req.onsuccess = e => { db = e.target.result; resolve(); };
    req.onerror   = () => reject(req.error);
  });
}

function dbGetAll(store) {
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readonly').objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror   = () => rej(req.error);
  });
}
function dbAdd(store, obj) {
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readwrite').objectStore(store).add({ ...obj, createdAt: Date.now() });
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}
function dbPut(store, obj) {
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readwrite').objectStore(store).put(obj);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}
function dbDelete(store, id) {
  return new Promise((res, rej) => {
    const req = db.transaction(store,'readwrite').objectStore(store).delete(id);
    req.onsuccess = () => res();
    req.onerror   = () => rej(req.error);
  });
}

// ===========================
// NAVIGATION
// ===========================
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + page);
  if (pg) pg.classList.add('active');
  const ni = document.querySelector(`[data-page="${page}"]`);
  if (ni) ni.classList.add('active');
  closeSidebar();

  if (page === 'dashboard')  loadDashboard();
  if (page === 'report')     loadReport();
  if (page === 'ledger')     initLedgerPage();
  if (page === 'add-vendor') { resetAddPage(); populateVendorDropdowns(); setTimeout(setTodayDates, 30); }
}

function resetAddPage() {
  document.getElementById('formTitle').textContent = 'Add Bill / Payment';
  document.getElementById('editId').value = '';
  document.getElementById('editMode').value = '';
  clearBillForm();
  clearPayForm();
  switchTab('bill');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

// ===========================
// TABS
// ===========================
function switchTab(tab) {
  document.getElementById('tabBill').style.display    = tab === 'bill' ? '' : 'none';
  document.getElementById('tabPay').style.display     = tab === 'pay'  ? '' : 'none';
  document.getElementById('tabBillBtn').classList.toggle('active', tab === 'bill');
  document.getElementById('tabPayBtn').classList.toggle('active',  tab === 'pay');
  if (tab === 'pay') { populatePayVendor(); setTimeout(setTodayDates, 30); }
}

// ===========================
// DATE FUNCTIONS
// ===========================

// Native picker (yyyy-mm-dd) → text field (dd/mm/yy)
function syncDate(nativeId, textId) {
  const val = document.getElementById(nativeId)?.value;
  if (!val) return;
  const [yy4, mm, dd] = val.split('-');
  document.getElementById(textId).value = `${dd}/${mm}/${yy4.slice(-2)}`;
}

// Manual text input → sync native (readonly now, kept for edit mode)
function formatDate(input, nativeId) {
  let v = input.value.replace(/\D/g,'');
  if (v.length > 6) v = v.slice(0,6);
  let out = v.slice(0,2);
  if (v.length >= 3) out += '/' + v.slice(2,4);
  if (v.length >= 5) out += '/' + v.slice(4,6);
  input.value = out;
  if (nativeId && /^\d{2}\/\d{2}\/\d{2}$/.test(out)) {
    const [dd,mm,yy] = out.split('/');
    const nEl = document.getElementById(nativeId);
    if (nEl) nEl.value = `20${yy}-${mm}-${dd}`;
  }
}

function validateDate(d) { return /^\d{2}\/\d{2}\/\d{2}$/.test(d); }

function getTodayDDMMYY() {
  const n = new Date();
  return `${pad(n.getDate())}/${pad(n.getMonth()+1)}/${String(n.getFullYear()).slice(-2)}`;
}
function getTodayNative() {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}`;
}
function pad(n) { return String(n).padStart(2,'0'); }

// Auto-set today on all date pickers (only if empty)
function setTodayDates() {
  const tn = getTodayNative();
  const td = getTodayDDMMYY();
  [['fDateNative','fDate'],['pDateNative','pDate']].forEach(([nId,tId]) => {
    const nEl = document.getElementById(nId);
    const tEl = document.getElementById(tId);
    if (nEl && !nEl.value) nEl.value = tn;
    if (tEl && !tEl.value) tEl.value = td;
  });
}

// ===========================
// VENDOR AUTOCOMPLETE (bill form)
// ===========================
async function vendorAutocomplete(input) {
  const val = input.value.toLowerCase().trim();
  const list = document.getElementById('autocompleteList');
  if (!val) { list.style.display = 'none'; return; }

  const bills = await dbGetAll(BILLS);
  const vendors = [...new Set(bills.map(b => b.vendorName))].filter(v => v.toLowerCase().includes(val));

  if (!vendors.length) { list.style.display = 'none'; return; }

  list.innerHTML = vendors.map(v => `<div class="ac-item" onclick="selectVendor('${v.replace(/'/g,"\\'")}')"><span>👤</span> ${v}</div>`).join('');
  list.style.display = 'block';

  document.addEventListener('click', function close(e) {
    if (!e.target.closest('.autocomplete-wrap')) {
      list.style.display = 'none';
      document.removeEventListener('click', close);
    }
  });
}

function selectVendor(name) {
  document.getElementById('fVendorName').value = name;
  document.getElementById('autocompleteList').style.display = 'none';
  // Auto-fill mobile/city from last entry
  dbGetAll(BILLS).then(bills => {
    const last = [...bills].reverse().find(b => b.vendorName === name);
    if (last) {
      if (last.mobile) document.getElementById('fMobile').value = last.mobile;
      if (last.city)   document.getElementById('fCity').value   = last.city;
    }
  });
}

// ===========================
// SAVE BILL
// ===========================
async function saveBill() {
  const editId   = document.getElementById('editId').value;
  const editMode = document.getElementById('editMode').value;
  const vendorName = document.getElementById('fVendorName').value.trim();
  const mobile     = document.getElementById('fMobile').value.trim();
  const city       = document.getElementById('fCity').value.trim();
  const date       = document.getElementById('fDate').value.trim();
  const billNo     = document.getElementById('fBillNo').value.trim();
  const amount     = parseFloat(document.getElementById('fAmount').value);
  const description= document.getElementById('fDescription').value.trim();

  if (!vendorName) return showToast('Vendor name required', 'error');
  if (!date || !validateDate(date)) return showToast('Date dd/mm/yy format mein', 'error');
  if (!billNo) return showToast('Bill No required', 'error');
  if (!amount || isNaN(amount) || amount <= 0) return showToast('Valid amount required', 'error');

  const obj = { vendorName, mobile, city, date, billNo, amount, description };

  try {
    if (editId && editMode === 'bill') {
      await dbPut(BILLS, { ...obj, id: parseInt(editId) });
      showToast('Bill updated ✓', 'success');
    } else {
      await dbAdd(BILLS, obj);
      showToast('Bill saved ✓', 'success');
    }
    clearBillForm();
    document.getElementById('editId').value = '';
    document.getElementById('editMode').value = '';
    document.getElementById('formTitle').textContent = 'Add Bill / Payment';
    updateMobileBadge();
  } catch { showToast('Error saving bill', 'error'); }
}

function clearBillForm() {
  ['fVendorName','fMobile','fCity','fDate','fBillNo','fAmount','fDescription'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}

// ===========================
// PAYMENT VENDOR DROPDOWN
// ===========================
async function populatePayVendor() {
  const bills = await dbGetAll(BILLS);
  const vendors = [...new Set(bills.map(b => b.vendorName))].sort();
  const sel = document.getElementById('pVendor');
  const current = sel.value;
  sel.innerHTML = '<option value="">— Vendor chunein —</option>' +
    vendors.map(v => `<option value="${v}" ${v===current?'selected':''}>${v}</option>`).join('');
  if (current) loadVendorBillsForPay();
}

async function populateVendorDropdowns() {
  await populatePayVendor();
}

// ===========================
// LOAD VENDOR BILLS FOR PAYMENT
// ===========================
async function loadVendorBillsForPay() {
  const vendor = document.getElementById('pVendor').value;
  const outWrap = document.getElementById('outstandingWrap');
  const billRefSel = document.getElementById('pBillRef');
  const billPrevWrap = document.getElementById('billPreviewWrap');

  if (!vendor) {
    outWrap.style.display = 'none';
    billRefSel.innerHTML = '<option value="">— Pehle vendor chunein —</option>';
    billPrevWrap.style.display = 'none';
    return;
  }

  const [bills, payments] = await Promise.all([dbGetAll(BILLS), dbGetAll(PAYMENTS)]);
  const vBills    = bills.filter(b => b.vendorName === vendor).sort((a,b) => dateSort(a.date,b.date));
  const vPayments = payments.filter(p => p.vendorName === vendor);

  const totalBill = vBills.reduce((s,b) => s + b.amount, 0);
  const totalPaid = vPayments.reduce((s,p) => s + p.amount, 0);
  const outstanding = totalBill - totalPaid;

  // Show outstanding box
  outWrap.style.display = '';
  document.getElementById('outTotalBill').textContent = 'PKR ' + totalBill.toLocaleString('en-PK');
  document.getElementById('outTotalPaid').textContent = 'PKR ' + totalPaid.toLocaleString('en-PK');
  const balEl = document.getElementById('outBalance');
  balEl.textContent = 'PKR ' + Math.abs(outstanding).toLocaleString('en-PK') + (outstanding < 0 ? ' (Overpaid)' : '');
  balEl.className = 'out-num ' + (outstanding > 0 ? 'out-bal' : 'out-credit');

  // Bill reference dropdown — show unpaid / partial bills
  billRefSel.innerHTML = '<option value="">— General Payment —</option>';
  vBills.forEach(b => {
    const paidForBill = payments.filter(p => p.billId === b.id).reduce((s,p) => s + p.amount, 0);
    const remaining = b.amount - paidForBill;
    const status = remaining <= 0 ? '✅' : remaining < b.amount ? '⚡' : '🔴';
    billRefSel.innerHTML += `<option value="${b.id}" data-amount="${b.amount}" data-remaining="${remaining}">
      ${status} ${b.billNo} | ${b.date} | PKR ${b.amount.toLocaleString('en-PK')} | Baki: PKR ${Math.max(0,remaining).toLocaleString('en-PK')}
    </option>`;
  });

  billPrevWrap.style.display = 'none';
}

async function billSelected() {
  const billId = parseInt(document.getElementById('pBillRef').value);
  const wrap = document.getElementById('billPreviewWrap');
  if (!billId) { wrap.style.display = 'none'; return; }

  const bills = await dbGetAll(BILLS);
  const payments = await dbGetAll(PAYMENTS);
  const bill = bills.find(b => b.id === billId);
  if (!bill) { wrap.style.display = 'none'; return; }

  const paidForBill = payments.filter(p => p.billId === billId).reduce((s,p) => s + p.amount, 0);
  const remaining = bill.amount - paidForBill;

  document.getElementById('billPreview').innerHTML = `
    <div class="bp-row"><span class="bp-label">Bill No</span><span class="bp-val">${bill.billNo}</span></div>
    <div class="bp-row"><span class="bp-label">Date</span><span class="bp-val">${bill.date}</span></div>
    <div class="bp-row"><span class="bp-label">Bill Amount</span><span class="bp-val td-debit">PKR ${bill.amount.toLocaleString('en-PK')}</span></div>
    <div class="bp-row"><span class="bp-label">Paid So Far</span><span class="bp-val td-credit">PKR ${paidForBill.toLocaleString('en-PK')}</span></div>
    <div class="bp-row highlight"><span class="bp-label">⚡ Remaining</span><span class="bp-val out-bal">PKR ${Math.max(0,remaining).toLocaleString('en-PK')}</span></div>
    ${bill.description ? `<div class="bp-row"><span class="bp-label">Note</span><span class="bp-val" style="color:#888">${bill.description}</span></div>` : ''}`;

  wrap.style.display = '';

  // Auto-fill amount with remaining
  if (remaining > 0) document.getElementById('pAmount').value = remaining;
}

function checkPayAmount() {
  // Just validate visually if overpaying
  const billId = parseInt(document.getElementById('pBillRef').value);
  if (!billId) return;
  const opt = document.getElementById('pBillRef').selectedOptions[0];
  const remaining = parseFloat(opt?.dataset.remaining || 0);
  const entered = parseFloat(document.getElementById('pAmount').value || 0);
  const btn = document.querySelector('.btn-pay');
  if (btn && remaining > 0 && entered > remaining) {
    btn.style.background = '#F59E0B';
    btn.title = 'Amount bill se zyada hai!';
  } else if (btn) {
    btn.style.background = '';
    btn.title = '';
  }
}

// ===========================
// SAVE PAYMENT
// ===========================
async function savePayment() {
  const editId   = document.getElementById('editId').value;
  const editMode = document.getElementById('editMode').value;
  const vendor  = document.getElementById('pVendor').value;
  const billRef = document.getElementById('pBillRef').value;
  const date    = document.getElementById('pDate').value.trim();
  const amount  = parseFloat(document.getElementById('pAmount').value);
  const payment = document.getElementById('pPayment').value;
  const refNo   = document.getElementById('pRef').value.trim();
  const note    = document.getElementById('pNote').value.trim();

  if (!vendor)  return showToast('Vendor select karein', 'error');
  if (!date || !validateDate(date)) return showToast('Date dd/mm/yy format mein', 'error');
  if (!amount || isNaN(amount) || amount <= 0) return showToast('Valid amount darj karein', 'error');
  if (!payment) return showToast('Payment method select karein', 'error');

  const obj = {
    vendorName: vendor,
    billId: billRef ? parseInt(billRef) : null,
    date, amount, payment,
    refNo, note
  };

  try {
    if (editId && editMode === 'payment') {
      await dbPut(PAYMENTS, { ...obj, id: parseInt(editId) });
      showToast('Payment updated ✓', 'success');
    } else {
      await dbAdd(PAYMENTS, obj);
      showToast('Payment save ho gayi ✓', 'success');
    }
    clearPayForm();
    document.getElementById('editId').value = '';
    document.getElementById('editMode').value = '';
    updateMobileBadge();
    // Refresh outstanding
    loadVendorBillsForPay();
  } catch { showToast('Error saving payment', 'error'); }
}

function clearPayForm() {
  ['pDate','pAmount','pRef','pNote'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value='';
  });
  const pv = document.getElementById('pVendor'); if(pv) pv.value='';
  const pp = document.getElementById('pPayment'); if(pp) pp.value='';
  const pb = document.getElementById('pBillRef'); if(pb) pb.innerHTML='<option value="">— Pehle vendor chunein —</option>';
  const ow = document.getElementById('outstandingWrap'); if(ow) ow.style.display='none';
  const bw = document.getElementById('billPreviewWrap'); if(bw) bw.style.display='none';
}

// ===========================
// OPEN PAYMENT FROM LEDGER
// ===========================
function openPaymentForVendor() {
  const vendor = document.getElementById('ledgerVendor').value;
  navigate('add-vendor');
  setTimeout(async () => {
    switchTab('pay');
    await populatePayVendor();
    if (vendor) {
      document.getElementById('pVendor').value = vendor;
      await loadVendorBillsForPay();
    }
  }, 80);
}

// ===========================
// DASHBOARD
// ===========================
async function loadDashboard() {
  const [bills, payments] = await Promise.all([dbGetAll(BILLS), dbGetAll(PAYMENTS)]);
  const vendors = [...new Set(bills.map(b => b.vendorName))];
  const totalBill = bills.reduce((s,b) => s + b.amount, 0);
  const totalPaid = payments.reduce((s,p) => s + p.amount, 0);
  const today = getTodayDDMMYY();
  const todayBills = bills.filter(b => b.date === today).length;

  document.getElementById('statVendors').textContent = vendors.length;
  document.getElementById('statEntries').textContent = bills.length;
  document.getElementById('statAmount').textContent  = formatPKR(totalBill - totalPaid);
  document.getElementById('statPaid').textContent    = formatPKR(totalPaid);

  // Recent — merge bills + payments, sort by createdAt desc
  const recentBills = bills.map(b => ({ ...b, _type:'bill' }));
  const recentPays  = payments.map(p => ({ ...p, _type:'payment' }));
  const all = [...recentBills, ...recentPays].sort((a,b) => (b.createdAt||0)-(a.createdAt||0)).slice(0,7);

  const rl = document.getElementById('recentList');
  if (!all.length) {
    rl.innerHTML = '<div class="empty-state">No entries yet. Add your first bill!</div>';
  } else {
    rl.innerHTML = all.map(e => e._type === 'bill' ? `
      <div class="recent-item">
        <div class="ri-icon ri-bill">📋</div>
        <div style="flex:1">
          <div class="recent-vendor">${e.vendorName}</div>
          <div class="recent-bill">${e.billNo} • ${e.date}</div>
        </div>
        <div style="text-align:right">
          <div class="recent-amount td-debit">-PKR ${e.amount.toLocaleString('en-PK')}</div>
          <div class="recent-date">Bill</div>
        </div>
      </div>` : `
      <div class="recent-item credit">
        <div class="ri-icon ri-pay">✅</div>
        <div style="flex:1">
          <div class="recent-vendor">${e.vendorName}</div>
          <div class="recent-bill">${e.refNo||'Payment'} • ${e.date}</div>
        </div>
        <div style="text-align:right">
          <div class="recent-amount td-credit">+PKR ${e.amount.toLocaleString('en-PK')}</div>
          <div class="recent-date">${paymentIcon(e.payment)} ${e.payment}</div>
        </div>
      </div>`).join('');
  }

  drawPieChart(payments);
  updateMobileBadge();
}

function drawPieChart(payments) {
  const totals = {};
  payments.forEach(p => { totals[p.payment] = (totals[p.payment]||0) + p.amount; });
  const colors = { Cash:'#C8960A', Online:'#6B7BF7', EasyPaisa:'#059669', JazzCash:'#DB2777' };
  const total = Object.values(totals).reduce((a,b)=>a+b,0);
  const canvas = document.getElementById('pieCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,140,140);
  if (!total) { document.getElementById('paymentLegend').innerHTML = '<div class="legend-empty">No payments yet</div>'; return; }
  let start = -Math.PI/2;
  Object.entries(totals).forEach(([m,v]) => {
    const sl = (v/total)*Math.PI*2;
    ctx.beginPath(); ctx.moveTo(70,70); ctx.arc(70,70,55,start,start+sl); ctx.closePath();
    ctx.fillStyle = colors[m]||'#999'; ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
    start += sl;
  });
  ctx.beginPath(); ctx.arc(70,70,28,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill();
  ctx.fillStyle='#1A1B3A'; ctx.font='bold 10px Outfit'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('Payments',70,63); ctx.font='bold 9px JetBrains Mono'; ctx.fillText(formatPKR(total),70,75);
  document.getElementById('paymentLegend').innerHTML = Object.entries(totals).map(([m,v]) =>
    `<div class="legend-item"><span class="legend-dot" style="background:${colors[m]||'#999'}"></span>
     <span class="legend-label">${m}</span><span class="legend-val">${formatPKR(v)}</span></div>`).join('');
}

// ===========================
// REPORT
// ===========================
let reportAllData = [];
async function loadReport() {
  const [bills, payments] = await Promise.all([dbGetAll(BILLS), dbGetAll(PAYMENTS)]);
  reportAllData = [
    ...bills.map(b => ({ ...b, _type:'bill' })),
    ...payments.map(p => ({ ...p, _type:'payment' }))
  ].sort((a,b) => dateSort2(b.date, a.date) || (b.createdAt||0)-(a.createdAt||0));
  filterReport();
}

function filterReport() {
  const q  = (document.getElementById('searchInput')?.value||'').toLowerCase();
  const fp = document.getElementById('filterPayment')?.value||'';
  const ft = document.getElementById('filterType')?.value||'';

  const filtered = reportAllData.filter(e => {
    const matchQ = !q || (e.vendorName||'').toLowerCase().includes(q) ||
      (e.billNo||'').toLowerCase().includes(q) || (e.city||'').toLowerCase().includes(q) ||
      (e.refNo||'').toLowerCase().includes(q);
    const matchP = !fp || e.payment === fp;
    const matchT = !ft || e._type === ft;
    return matchQ && matchP && matchT;
  });

  document.getElementById('reportCount').textContent = `Showing ${filtered.length} entries`;
  renderReport(filtered);
}

function renderReport(data) {
  const wrapper = document.getElementById('reportTable');
  if (!data.length) { wrapper.innerHTML = '<div class="empty-state">No entries found.</div>'; return; }
  const rows = data.map(e => e._type === 'bill' ? `
    <tr>
      <td><span class="type-badge type-debit">📋 Bill</span></td>
      <td class="td-vendor">${e.vendorName}</td>
      <td>${e.city||'—'}</td>
      <td>${e.mobile||'—'}</td>
      <td class="td-bill">${e.billNo}</td>
      <td>${e.date}</td>
      <td class="td-amount td-debit">PKR ${e.amount.toLocaleString('en-PK')}</td>
      <td>—</td>
      <td>${e.description||'—'}</td>
      <td><div class="action-btns">
        <button class="btn-edit" onclick="editBill(${e.id})">✎ Edit</button>
        <button class="btn-delete" onclick="deleteBill(${e.id})">✕</button>
      </div></td>
    </tr>` : `
    <tr style="background:#F0FDF4">
      <td><span class="type-badge type-credit">✅ Payment</span></td>
      <td class="td-vendor">${e.vendorName}</td>
      <td>—</td><td>—</td>
      <td class="td-bill">${e.refNo||'—'}</td>
      <td>${e.date}</td>
      <td class="td-amount td-credit">PKR ${e.amount.toLocaleString('en-PK')}</td>
      <td><span class="payment-badge ${payClass(e.payment)}">${paymentIcon(e.payment)} ${e.payment}</span></td>
      <td>${e.note||'—'}</td>
      <td><div class="action-btns">
        <button class="btn-edit" onclick="editPayment(${e.id})">✎ Edit</button>
        <button class="btn-delete" onclick="deletePayment(${e.id})">✕</button>
      </div></td>
    </tr>`).join('');

  wrapper.innerHTML = `<div class="table-wrapper"><table>
    <thead><tr>
      <th>Type</th><th>Vendor</th><th>City</th><th>Mobile</th>
      <th>Bill/Ref</th><th>Date</th><th>Amount</th><th>Payment</th>
      <th>Description</th><th>Action</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ===========================
// LEDGER
// ===========================
async function initLedgerPage() {
  const bills = await dbGetAll(BILLS);
  const vendors = [...new Set(bills.map(b => b.vendorName))].sort();
  const sel = document.getElementById('ledgerVendor');
  const current = sel.value;
  sel.innerHTML = '<option value="">— Vendor chunein —</option>' +
    vendors.map(v => `<option value="${v}" ${v===current?'selected':''}>${v}</option>`).join('');
  if (current) loadLedger();
}

async function loadLedger() {
  const vendor = document.getElementById('ledgerVendor').value;
  const content = document.getElementById('ledgerContent');
  if (!vendor) { content.innerHTML = '<div class="empty-state">Vendor select karein.</div>'; return; }

  const [bills, allPayments] = await Promise.all([dbGetAll(BILLS), dbGetAll(PAYMENTS)]);
  const vBills    = bills.filter(b => b.vendorName === vendor).sort((a,b) => dateSort(a.date,b.date));
  const vPayments = allPayments.filter(p => p.vendorName === vendor).sort((a,b) => dateSort(a.date,b.date));

  if (!vBills.length && !vPayments.length) {
    content.innerHTML = '<div class="empty-state">Is vendor ki koi entry nahi mili.</div>';
    return;
  }

  // Build combined ledger rows: bills = debit, payments = credit
  const rows = [];
  vBills.forEach(b => rows.push({ ...b, _type:'bill', _sortKey: dateSortKey(b.date) + String(b.createdAt||0).padStart(15,'0') }));
  vPayments.forEach(p => rows.push({ ...p, _type:'payment', _sortKey: dateSortKey(p.date) + String(p.createdAt||0).padStart(15,'0') }));
  rows.sort((a,b) => a._sortKey.localeCompare(b._sortKey));

  let balance = 0, totalDebit = 0, totalCredit = 0;
  const tableRows = rows.map(r => {
    if (r._type === 'bill') {
      balance -= r.amount;
      totalDebit += r.amount;

      // Find payments against this bill
      const billPayments = vPayments.filter(p => p.billId === r.id);
      const paidForBill  = billPayments.reduce((s,p) => s + p.amount, 0);
      const remaining    = r.amount - paidForBill;
      const statusBadge  = remaining <= 0
        ? '<span class="pay-status paid">✅ Paid</span>'
        : remaining < r.amount
        ? '<span class="pay-status partial">⚡ Partial</span>'
        : '<span class="pay-status unpaid">🔴 Unpaid</span>';

      return `<tr class="row-bill">
        <td>${r.date}</td>
        <td class="td-bill">${r.billNo}</td>
        <td>${r.description||'—'}</td>
        <td>—</td>
        <td class="td-amount td-debit">PKR ${r.amount.toLocaleString('en-PK')}</td>
        <td>—</td>
        <td class="td-amount" style="color:${balance<0?'#EF4444':'#059669'};font-weight:700">
          PKR ${Math.abs(balance).toLocaleString('en-PK')} ${balance<0?'<small style="font-size:10px">(Dr)</small>':'<small>(Cr)</small>'}
        </td>
        <td>${statusBadge}</td>
        <td><div class="action-btns">
          <button class="btn-edit" onclick="editBill(${r.id})">✎</button>
          <button class="btn-delete" onclick="deleteBill(${r.id},true)">✕</button>
        </div></td>
      </tr>`;

    } else {
      balance += r.amount;
      totalCredit += r.amount;
      const billLabel = r.billId
        ? (() => { const b = vBills.find(b=>b.id===r.billId); return b ? `Against: ${b.billNo}` : ''; })()
        : 'General';

      return `<tr class="row-pay">
        <td>${r.date}</td>
        <td class="td-bill">${r.refNo||'—'}</td>
        <td>${r.note||billLabel||'—'}</td>
        <td><span class="payment-badge ${payClass(r.payment)}">${paymentIcon(r.payment)} ${r.payment}</span></td>
        <td>—</td>
        <td class="td-amount td-credit">PKR ${r.amount.toLocaleString('en-PK')}</td>
        <td class="td-amount" style="color:${balance<0?'#EF4444':'#059669'};font-weight:700">
          PKR ${Math.abs(balance).toLocaleString('en-PK')} ${balance<0?'<small style="font-size:10px">(Dr)</small>':'<small>(Cr)</small>'}
        </td>
        <td><span class="pay-status paid">✅ Payment</span></td>
        <td><div class="action-btns">
          <button class="btn-edit" onclick="editPayment(${r.id})">✎</button>
          <button class="btn-delete" onclick="deletePayment(${r.id},true)">✕</button>
        </div></td>
      </tr>`;
    }
  }).join('');

  content.innerHTML = `
    <div class="ledger-summary">
      <div class="ledger-sum-card">
        <div class="ledger-sum-label">Total Debit (Bills)</div>
        <div class="ledger-sum-val sum-debit">PKR ${totalDebit.toLocaleString('en-PK')}</div>
      </div>
      <div class="ledger-sum-card">
        <div class="ledger-sum-label">Total Credit (Payments)</div>
        <div class="ledger-sum-val sum-credit">PKR ${totalCredit.toLocaleString('en-PK')}</div>
      </div>
      <div class="ledger-sum-card">
        <div class="ledger-sum-label">Net Balance</div>
        <div class="ledger-sum-val ${balance<0?'sum-debit':'sum-credit'}">
          PKR ${Math.abs(balance).toLocaleString('en-PK')} ${balance<0?'(Dr)':'(Cr)'}
        </div>
      </div>
    </div>
    <div class="table-wrapper">
      <table id="ledgerTable">
        <thead><tr>
          <th>Date</th><th>Bill/Ref No</th><th>Description</th>
          <th>Payment Method</th><th>Debit</th><th>Credit</th>
          <th>Balance</th><th>Status</th><th>Action</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

// ===========================
// EDIT / DELETE BILL
// ===========================
async function editBill(id) {
  const bills = await dbGetAll(BILLS);
  const b = bills.find(b => b.id === id);
  if (!b) return;
  navigate('add-vendor');
  setTimeout(() => {
    switchTab('bill');
    document.getElementById('formTitle').textContent = 'Edit Bill';
    document.getElementById('editId').value = id;
    document.getElementById('editMode').value = 'bill';
    document.getElementById('fVendorName').value = b.vendorName;
    document.getElementById('fMobile').value = b.mobile||'';
    document.getElementById('fCity').value = b.city||'';
    document.getElementById('fDate').value = b.date;
    // Sync native picker
    if (b.date && validateDate(b.date)) {
      const [dd,mm,yy] = b.date.split('/');
      document.getElementById('fDateNative').value = `20${yy}-${mm}-${dd}`;
    }
    document.getElementById('fBillNo').value = b.billNo;
    document.getElementById('fAmount').value = b.amount;
    document.getElementById('fDescription').value = b.description||'';
  }, 60);
}

async function deleteBill(id, fromLedger=false) {
  // Check if payments against this bill
  const payments = await dbGetAll(PAYMENTS);
  const linked = payments.filter(p => p.billId === id);
  let msg = 'Is bill ko delete karein?';
  if (linked.length) msg += `\n\n⚠ Is bill ke against ${linked.length} payment(s) hain. Woh bhi delete hongi.`;
  if (!confirm(msg)) return;
  if (linked.length) await Promise.all(linked.map(p => dbDelete(PAYMENTS, p.id)));
  await dbDelete(BILLS, id);
  showToast('Bill deleted', 'info');
  updateMobileBadge();
  if (fromLedger) loadLedger(); else loadReport();
  loadDashboard();
}

// ===========================
// EDIT / DELETE PAYMENT
// ===========================
async function editPayment(id) {
  const payments = await dbGetAll(PAYMENTS);
  const p = payments.find(p => p.id === id);
  if (!p) return;
  navigate('add-vendor');
  setTimeout(async () => {
    switchTab('pay');
    await populatePayVendor();
    document.getElementById('formTitle').textContent = 'Edit Payment';
    document.getElementById('editId').value = id;
    document.getElementById('editMode').value = 'payment';
    document.getElementById('pVendor').value = p.vendorName;
    await loadVendorBillsForPay();
    if (p.billId) document.getElementById('pBillRef').value = p.billId;
    document.getElementById('pDate').value = p.date;
    // Sync native picker
    if (p.date && validateDate(p.date)) {
      const [dd,mm,yy] = p.date.split('/');
      document.getElementById('pDateNative').value = `20${yy}-${mm}-${dd}`;
    }
    document.getElementById('pAmount').value = p.amount;
    document.getElementById('pPayment').value = p.payment;
    document.getElementById('pRef').value = p.refNo||'';
    document.getElementById('pNote').value = p.note||'';
  }, 60);
}

function deletePayment(id, fromLedger=false) {
  if (!confirm('Payment delete karein?')) return;
  dbDelete(PAYMENTS, id).then(() => {
    showToast('Payment deleted', 'info');
    updateMobileBadge();
    if (fromLedger) loadLedger(); else loadReport();
    loadDashboard();
  });
}

// ===========================
// DOWNLOAD
// ===========================
async function downloadReport() {
  const [bills, payments] = await Promise.all([dbGetAll(BILLS), dbGetAll(PAYMENTS)]);
  const today = getTodayDDMMYY();
  const allRows = [
    ...bills.map(b => `<tr><td>📋 Bill</td><td>${b.vendorName}</td><td>${b.billNo}</td>
      <td>${b.date}</td><td style="color:#DC2626;font-weight:700">PKR ${b.amount.toLocaleString('en-PK')}</td>
      <td>—</td><td>—</td><td>${b.description||'—'}</td></tr>`),
    ...payments.map(p => `<tr style="background:#F0FDF4"><td>✅ Payment</td><td>${p.vendorName}</td>
      <td>${p.refNo||'—'}</td><td>${p.date}</td><td>—</td>
      <td style="color:#059669;font-weight:700">PKR ${p.amount.toLocaleString('en-PK')}</td>
      <td>${p.payment}</td><td>${p.note||'—'}</td></tr>`)
  ].join('');

  const table = `<table><thead><tr><th>Type</th><th>Vendor</th><th>Bill/Ref</th><th>Date</th>
    <th>Debit</th><th>Credit</th><th>Payment</th><th>Note</th></tr></thead><tbody>${allRows}</tbody></table>`;
  triggerDownload(buildDownloadHTML('All Vendor Report', today, table), `VendorPro_Report_${today.replace(/\//g,'')}.html`);
}

async function downloadLedger() {
  const vendor = document.getElementById('ledgerVendor').value;
  if (!vendor) { showToast('Pehle vendor select karein', 'error'); return; }
  const [bills, allPayments] = await Promise.all([dbGetAll(BILLS), dbGetAll(PAYMENTS)]);
  const vBills    = bills.filter(b => b.vendorName === vendor).sort((a,b) => dateSort(a.date,b.date));
  const vPayments = allPayments.filter(p => p.vendorName === vendor).sort((a,b) => dateSort(a.date,b.date));
  const rows = [];
  vBills.forEach(b => rows.push({ ...b, _type:'bill', _key: dateSortKey(b.date)+(b.createdAt||0) }));
  vPayments.forEach(p => rows.push({ ...p, _type:'payment', _key: dateSortKey(p.date)+(p.createdAt||0) }));
  rows.sort((a,b) => String(a._key).localeCompare(String(b._key)));
  let balance=0;
  const tRows = rows.map(r => {
    const d = r._type==='bill' ? r.amount : 0;
    const c = r._type==='payment' ? r.amount : 0;
    balance += c - d;
    return `<tr style="${r._type==='payment'?'background:#F0FDF4':''}">
      <td>${r.date}</td><td>${r._type==='bill'?r.billNo:(r.refNo||'—')}</td>
      <td>${r._type==='bill'?(r.description||'—'):(r.note||'—')}</td>
      <td>${r._type==='payment'?r.payment:'—'}</td>
      <td style="color:#DC2626;font-weight:700">${d>0?'PKR '+d.toLocaleString('en-PK'):'—'}</td>
      <td style="color:#059669;font-weight:700">${c>0?'PKR '+c.toLocaleString('en-PK'):'—'}</td>
      <td style="color:${balance<0?'#DC2626':'#4B5BDA'};font-weight:700">PKR ${Math.abs(balance).toLocaleString('en-PK')} ${balance<0?'(Dr)':'(Cr)'}</td>
    </tr>`;
  }).join('');
  const table = `<table><thead><tr><th>Date</th><th>Bill/Ref</th><th>Description</th>
    <th>Payment</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>${tRows}</tbody></table>`;
  const today = getTodayDDMMYY();
  triggerDownload(buildDownloadHTML(`Ledger — ${vendor}`, today, table),
    `Ledger_${vendor.replace(/\s/g,'_')}_${today.replace(/\//g,'')}.html`);
}

function buildDownloadHTML(title, date, tableHTML) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:'Segoe UI',sans-serif;padding:30px;color:#1A1B3A}
h1{font-size:22px;font-weight:800;color:#4B5BDA;margin-bottom:4px}.meta{font-size:12px;color:#888;margin-bottom:24px}
table{width:100%;border-collapse:collapse;font-size:13px}thead{background:#4B5BDA;color:#fff}
th{padding:10px 12px;text-align:left;font-weight:600}td{padding:9px 12px;border-bottom:1px solid #E2E4F0}
tr:nth-child(even){background:#F4F5FF}.footer{margin-top:28px;font-size:11px;color:#aaa;text-align:center}
</style></head><body>
<h1>VendorPro — ${title}</h1>
<div class="meta">Generated: ${date} | VendorPro Management Suite</div>
${tableHTML}
<div class="footer">© VendorPro Management Suite</div></body></html>`;
}

function triggerDownload(html, filename) {
  const blob = new Blob([html], { type:'text/html;charset=utf-8' });
  if (window.showSaveFilePicker) {
    window.showSaveFilePicker({ suggestedName: filename,
      types:[{ description:'HTML', accept:{'text/html':['.html']} }]
    }).then(async fh => {
      const w = await fh.createWritable(); await w.write(blob); await w.close();
      showToast('File saved!', 'success');
    }).catch(() => fallbackDownload(blob, filename));
  } else { fallbackDownload(blob, filename); }
}
function fallbackDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url); showToast('Downloaded!', 'success');
}

// ===========================
// UTILITIES
// ===========================
function formatPKR(n) {
  if (n >= 100000) return (n/100000).toFixed(1)+'L';
  if (n >= 1000)   return (n/1000).toFixed(1)+'K';
  return n.toLocaleString('en-PK');
}
function payClass(p) {
  return { Cash:'pay-cash', Online:'pay-online', EasyPaisa:'pay-easypaisa', JazzCash:'pay-jazzcash' }[p]||'';
}
function paymentIcon(p) {
  return { Cash:'💵', Online:'🌐', EasyPaisa:'📱', JazzCash:'📲' }[p]||'💳';
}
function dateSort(a,b) {
  return dateSortKey(a).localeCompare(dateSortKey(b));
}
function dateSort2(a,b) { return dateSortKey(b).localeCompare(dateSortKey(a)); }
function dateSortKey(d) {
  if (!d) return '000000';
  const [dd,mm,yy] = d.split('/');
  return `${yy||'00'}${mm||'00'}${dd||'00'}`;
}
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}
async function updateMobileBadge() {
  const [b,p] = await Promise.all([dbGetAll(BILLS), dbGetAll(PAYMENTS)]);
  document.getElementById('mobileBadge').textContent = b.length + p.length;
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

// ===========================
// INIT
// ===========================
initDB().then(() => {
  loadDashboard();
  updateMobileBadge();
  document.getElementById('dbStatus').innerHTML = '<span class="status-dot"></span> Database Ready';
}).catch(err => {
  console.error(err);
  document.getElementById('dbStatus').innerHTML = '⚠ DB Error';
});
