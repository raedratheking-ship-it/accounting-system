/* =====================================================================
   النظام المحاسبي المتكامل - app.js
   VERSION 3 - إصلاح قراءة حقول الخصم/الضريبة/المدفوع
   ===================================================================== */

console.log('✅ app.js VERSION 3 loaded — ' + new Date().toISOString());

/* ===================== Utilities ===================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => (Number(n)||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toISOString().slice(0,10);
const monthNow = () => new Date().toISOString().slice(0,7);

/* ✅ تحويل الأرقام العربية إلى لاتينية */
function toLatinDigits(str) {
  return String(str || '')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[،,]/g, '.');
}

/* ✅ قراءة رقم بأي صيغة */
function parseNum(str, fallback = 0) {
  const latin = toLatinDigits(str);
  const n = parseFloat(latin);
  return isNaN(n) ? fallback : n;
}

/* ✅ قراءة مباشرة وآمنة من DOM */
const readNum = (sel, fallback = 0) => {
  const el = document.querySelector(sel);
  if (!el) return fallback;
  return parseNum(el.value, fallback);
};
const readStr = (sel, fallback = '') => {
  const el = document.querySelector(sel);
  return el ? (el.value || '').trim() : fallback;
};

/* ============ ✅ حفظ لحظي (احتياطي) ============ */
let purchaseForm = { disc: 0, tax: 0, paid: 0 };
let saleForm = { disc: 0, tax: 0, paid: 0 };

function onPurchaseField(field, value) {
  const v = parseNum(value, 0);
  purchaseForm[field] = v;
  console.log('[PURCHASE] ' + field + ' =', v, '(raw:', JSON.stringify(value) + ')');
  recalcPurchase();
}
function onSaleField(field, value) {
  const v = parseNum(value, 0);
  saleForm[field] = v;
  console.log('[SALE] ' + field + ' =', v, '(raw:', JSON.stringify(value) + ')');
  recalcSale();
}

/* ===================== State ===================== */
const state = {
  user: null,
  data: {
    customers:[], employees:[], items:[], sales:[], purchases:[],
    receipts:[], payments:[], advances:[], salaries:[]
  },
  settings: {
    businessName: 'فكرة للديكور والاعلان',
    address: 'القاعدة-شارع المشروع-جوار ملعب التضامن',
    phone1: '777-277-990',
    phone2: '779-504-646',
    logo: '',
    footer: 'شكراً لتعاملكم معنا'
  },
  unsubs: [],
  section: 'dashboard',
  filters: {}
};

const COLLECTIONS = ['customers','employees','items','sales','purchases','receipts','payments','advances','salaries'];

/* ===================== Auth ===================== */
$('#googleLogin').addEventListener('click', async () => {
  const provider = firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
  } catch (e) {
    $('#loginError').textContent = 'فشل تسجيل الدخول: ' + e.message;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  if (confirm('هل تريد تسجيل الخروج؟')) await auth.signOut();
});

auth.onAuthStateChanged(user => {
  if (user) {
    state.user = user;
    $('#loginScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#userName').textContent = user.displayName || user.email;
    $('#userPhoto').src = user.photoURL || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23cbd5e1"%3E%3Cpath d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/%3E%3C/svg%3E';
    loadData();
    showSection('dashboard');
  } else {
    state.user = null;
    state.unsubs.forEach(u => u());
    state.unsubs = [];
    COLLECTIONS.forEach(c => state.data[c] = []);
    $('#loginScreen').classList.remove('hidden');
    $('#app').classList.add('hidden');
  }
});

/* ===================== Firestore ===================== */
const userCol = name => db.collection('users').doc(state.user.uid).collection(name);

function loadData() {
  COLLECTIONS.forEach(col => {
    const unsub = userCol(col).onSnapshot(
      snap => {
        state.data[col] = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(x => !x.deleted);
        renderSection();
      },
      err => console.error(`Error loading ${col}:`, err)
    );
    state.unsubs.push(unsub);
  });

  const settingsUnsub = userCol('settings').doc('business').onSnapshot(snap => {
    if (snap.exists) {
      state.settings = { ...state.settings, ...snap.data() };
    }
    renderSection();
  }, err => console.warn('Settings load error:', err));
  state.unsubs.push(settingsUnsub);
}

async function nextNumber(type, prefix) {
  const ref = userCol('counters').doc(type);
  let num = 1;
  await db.runTransaction(async t => {
    const doc = await t.get(ref);
    num = doc.exists ? (doc.data().value || 0) + 1 : 1;
    t.set(ref, { value: num }, { merge: true });
  });
  return `${prefix}-${String(num).padStart(5, '0')}`;
}

async function softDelete(col, id) {
  if (!confirm('هل تريد الحذف؟')) return;
  await userCol(col).doc(id).update({ deleted: true, deletedAt: Date.now() });
}

/* ===================== Navigation ===================== */
$$('.nav a').forEach(a => a.addEventListener('click', e => {
  e.preventDefault();
  showSection(a.dataset.section);
}));

$('#menuToggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

function showSection(name) {
  state.section = name;
  state.filters = {};
  $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.section === name));
  const titles = {
    dashboard:'لوحة التحكم', sales:'فواتير البيع', purchases:'فواتير الشراء',
    customers:'العملاء والموردون', items:'الأصناف والمخزون', employees:'الموظفون',
    advances:'سلف الموظفين', salaries:'الرواتب', receipts:'سندات القبض',
    payments:'سندات الصرف', reports:'التقارير', settings:'الإعدادات'
  };
  $('#sectionTitle').textContent = titles[name] || '';
  renderSection();
  $('#sidebar').classList.remove('open');
}

function renderSection() {
  const c = $('#content');
  const map = {
    dashboard: renderDashboard, sales: renderSales, purchases: renderPurchases,
    customers: renderCustomers, items: renderItems, employees: renderEmployees,
    advances: renderAdvances, salaries: renderSalaries, receipts: renderReceipts,
    payments: renderPayments, reports: renderReports, settings: renderSettings
  };
  (map[state.section] || renderDashboard)(c);
}

/* ===================== Business Logic ===================== */
function customerBalance(id) {
  const c = state.data.customers.find(x => x.id === id);
  if (!c) return 0;
  const opening = Number(c.openingBalance) || 0;
  const salesRemaining = state.data.sales.filter(s => s.customerId === id)
    .reduce((s, x) => s + (Number(x.remaining) || 0), 0);
  const receipts = state.data.receipts.filter(r => r.customerId === id)
    .reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const purchasesRemaining = state.data.purchases.filter(p => p.supplierId === id)
    .reduce((s, x) => s + (Number(x.remaining) || 0), 0);
  const payments = state.data.payments.filter(p => p.partyId === id)
    .reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return opening + salesRemaining - receipts - purchasesRemaining + payments;
}

function employeeMonthData(empId, month) {
  const emp = state.data.employees.find(e => e.id === empId);
  if (!emp) return { total:0, advances:0, paid:0, remaining:0 };
  const total = (Number(emp.basicSalary) || 0) + (Number(emp.allowances) || 0);
  const advances = state.data.advances
    .filter(a => a.employeeId === empId && (a.date || '').startsWith(month))
    .reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const paid = state.data.salaries
    .filter(s => s.employeeId === empId && s.month === month)
    .reduce((s, x) => s + (Number(x.net) || 0), 0);
  return { total, advances, paid, remaining: total - advances - paid };
}

/* ===================== Modal Helpers ===================== */
function openModal(title, html) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modal').classList.remove('hidden');
}
function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modalBody').innerHTML = '';
}
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

/* ===================== Print Header/Footer ===================== */
function printHeaderHtml(docTitle) {
  const s = state.settings;
  const phones = [s.phone1, s.phone2].filter(Boolean).join(' / ');
  return `
    <div class="print-header">
      ${s.logo 
        ? `<img src="${s.logo}" class="print-logo" alt="logo">` 
        : `<div class="print-logo-placeholder">${esc((s.businessName||'؟').charAt(0))}</div>`}
      <div class="print-header-info">
        <h1>${esc(s.businessName || 'اسم المؤسسة')}</h1>
        ${s.address ? `<p>📍 ${esc(s.address)}</p>` : ''}
        ${phones ? `<p>📞 ${esc(phones)}</p>` : ''}
      </div>
    </div>
    <div class="print-doc-title">${esc(docTitle)}</div>
  `;
}
function printFooterHtml() {
  const s = state.settings;
  if (!s.footer) return '';
  return `<div class="print-footer">${esc(s.footer)}</div>`;
}

/* ===================== DASHBOARD ===================== */
function renderDashboard(c) {
  const sales = state.data.sales;
  const purchases = state.data.purchases;
  const totalSales = sales.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const totalPurchases = purchases.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const totalDebts = state.data.customers.reduce((s, cu) => {
    const b = customerBalance(cu.id);
    return s + (b > 0 ? b : 0);
  }, 0);
  const totalOwed = state.data.customers.reduce((s, cu) => {
    const b = customerBalance(cu.id);
    return s + (b < 0 ? -b : 0);
  }, 0);
  const totalCash = sales.reduce((s, x) => s + (Number(x.paid) || 0), 0);
  const lowStock = state.data.items.filter(i => Number(i.quantity) <= Number(i.minQuantity || 0)).length;

  c.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card green"><div class="stat-label">إجمالي المبيعات</div><div class="stat-value">${fmt(totalSales)}</div></div>
      <div class="stat-card orange"><div class="stat-label">إجمالي المشتريات</div><div class="stat-value">${fmt(totalPurchases)}</div></div>
      <div class="stat-card red"><div class="stat-label">ديون لنا (مدينون)</div><div class="stat-value">${fmt(totalDebts)}</div></div>
      <div class="stat-card purple"><div class="stat-label">ديون علينا (دائنون)</div><div class="stat-value">${fmt(totalOwed)}</div></div>
      <div class="stat-card"><div class="stat-label">النقد المُحصّل</div><div class="stat-value">${fmt(totalCash)}</div></div>
      <div class="stat-card"><div class="stat-label">عدد العملاء والموردين</div><div class="stat-value">${state.data.customers.length}</div></div>
      <div class="stat-card"><div class="stat-label">عدد الأصناف</div><div class="stat-value">${state.data.items.length}</div></div>
      <div class="stat-card ${lowStock ? 'red' : 'green'}"><div class="stat-label">أصناف تحت الحد الأدنى</div><div class="stat-value">${lowStock}</div></div>
    </div>

    <div class="card">
      <h3>🧾 أحدث فواتير البيع</h3>
      ${sales.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>النوع</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
        <tbody>${[...sales].sort((a,b)=>b.createdAt-a.createdAt).slice(0,5).map(s => `
          <tr>
            <td>${esc(s.number)}</td><td>${esc(s.date)}</td><td>${esc(s.customerName||'-')}</td>
            <td><span class="badge ${s.type==='cash'?'badge-green':'badge-orange'}">${s.type==='cash'?'نقدي':'آجل'}</span></td>
            <td>${fmt(s.total)}</td><td>${fmt(s.paid)}</td><td>${fmt(s.remaining)}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">📭</div>لا توجد فواتير بعد</div>`}
    </div>
  `;
}

/* ===================== SALES ===================== */
function renderSales(c) {
  const q = (state.filters.sales || '').toLowerCase();
  const list = [...state.data.sales]
    .filter(s => !q || (s.number||'').toLowerCase().includes(q) || (s.customerName||'').toLowerCase().includes(q))
    .sort((a,b)=>b.createdAt-a.createdAt);

  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" placeholder="🔍 بحث برقم الفاتورة أو العميل..." value="${esc(state.filters.sales||'')}" oninput="setFilter('sales',this.value)">
      </div>
      <div class="toolbar-right">
        ${list.length ? `<button class="btn btn-secondary" onclick="printSalesList()">🖨️ طباعة القائمة</button>` : ''}
        <button class="btn btn-primary" onclick="openSaleForm()">+ فاتورة بيع جديدة</button>
      </div>
    </div>
    <div class="card">
      ${list.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>النوع</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>إجراءات</th></tr></thead>
        <tbody>${list.map(s => `
          <tr>
            <td><strong>${esc(s.number)}</strong></td>
            <td>${esc(s.date)}</td>
            <td>${esc(s.customerName||'-')}</td>
            <td><span class="badge ${s.type==='cash'?'badge-green':'badge-orange'}">${s.type==='cash'?'نقدي':'آجل'}</span></td>
            <td>${fmt(s.total)}</td>
            <td>${fmt(s.paid)}</td>
            <td>${fmt(s.remaining)}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="printSale('${s.id}')">🖨️</button>
              <button class="btn btn-danger btn-sm" onclick="deleteSale('${s.id}')">🗑️</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">🧾</div>لا توجد فواتير بيع</div>`}
    </div>
  `;
}

function setFilter(k, v) { state.filters[k] = v; renderSection(); }

let tempSaleItems = [];

function openSaleForm() {
  tempSaleItems = [];
  saleForm = { disc: 0, tax: 0, paid: 0 };
  const items = state.data.items;

  openModal('فاتورة بيع جديدة', `
    <div class="form-row">
      <div class="form-group"><label>التاريخ</label><input type="date" id="saleDate" value="${today()}"></div>
      <div class="form-group"><label>نوع الفاتورة</label>
        <select id="saleType"><option value="cash">نقدي</option><option value="credit">آجل</option></select>
      </div>
    </div>
    <div class="form-group">
      <label>العميل * <small style="color:#64748b;font-weight:400;">(اكتب اسمًا جديدًا أو اختر من القائمة)</small></label>
      <input list="customersListS" id="saleCustomer" placeholder="اكتب أو اختر اسم العميل..." autocomplete="off">
      <datalist id="customersListS">
        ${state.data.customers.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}
      </datalist>
    </div>
    <div class="form-group"><label>الأصناف</label>
      <div id="saleItemsContainer"></div>
      ${items.length 
        ? `<button type="button" class="btn btn-secondary btn-sm" onclick="addSaleItemRow()">+ إضافة صنف</button>` 
        : `<div style="padding:12px;background:#fef3c7;border-radius:8px;color:#78350f;font-size:13px;">⚠️ لا توجد أصناف في المخزون. أضف أصنافًا أولًا من فاتورة شراء.</div>`}
    </div>
    <div class="form-row-3">
      <div class="form-group"><label>الخصم</label>
        <input type="text" inputmode="decimal" id="saleDiscount" value="0" oninput="onSaleField('disc', this.value)"></div>
      <div class="form-group"><label>الضريبة</label>
        <input type="text" inputmode="decimal" id="saleTax" value="0" oninput="onSaleField('tax', this.value)"></div>
      <div class="form-group"><label>المدفوع</label>
        <input type="text" inputmode="decimal" id="salePaid" value="0" oninput="onSaleField('paid', this.value)"></div>
    </div>
    <div class="form-group"><label>ملاحظات</label><textarea id="saleNotes" rows="2"></textarea></div>
    <div class="totals-box">
      <div class="totals-row"><span>المجموع الفرعي:</span><strong id="saleSubtotal">0</strong></div>
      <div class="totals-row"><span>الخصم:</span><strong id="saleDiscDisp">0</strong></div>
      <div class="totals-row"><span>الضريبة:</span><strong id="saleTaxDisp">0</strong></div>
      <div class="totals-row grand"><span>الإجمالي:</span><strong id="saleTotal">0</strong></div>
      <div class="totals-row"><span>المتبقي:</span><strong id="saleRemaining">0</strong></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="saveSale()">💾 حفظ الفاتورة</button>
    </div>
  `);
  if (items.length) addSaleItemRow();
}

function addSaleItemRow() {
  tempSaleItems.push({ itemId:'', name:'', qty:1, price:0, total:0 });
  renderSaleItemRows();
}

function renderSaleItemRows() {
  const cont = $('#saleItemsContainer');
  if (!cont) return;
  const items = state.data.items;
  cont.innerHTML = tempSaleItems.map((it, i) => `
    <div class="item-row">
      <select onchange="updateSaleItem(${i},'itemId',this.value)">
        <option value="">-- اختر صنف --</option>
        ${items.map(x=>`<option value="${x.id}" ${it.itemId===x.id?'selected':''}>${esc(x.name)} (متوفر: ${x.quantity||0})</option>`).join('')}
      </select>
      <input type="number" min="1" value="${it.qty}" onchange="updateSaleItem(${i},'qty',this.value)" placeholder="الكمية">
      <input type="number" min="0" step="0.01" value="${it.price}" onchange="updateSaleItem(${i},'price',this.value)" placeholder="السعر">
      <span class="row-total">${fmt(it.total)}</span>
      <button class="row-remove" onclick="removeSaleItem(${i})">×</button>
    </div>
  `).join('');
  recalcSale();
}

function updateSaleItem(i, field, val) {
  const it = tempSaleItems[i];
  if (!it) return;
  if (field === 'itemId') {
    const item = state.data.items.find(x => x.id === val);
    it.itemId = val; it.name = item?.name || '';
    if (item && !it.price) it.price = Number(item.price) || 0;
  } else if (field === 'qty') it.qty = Math.max(0, Number(val) || 0);
  else if (field === 'price') it.price = Math.max(0, Number(val) || 0);
  it.total = it.qty * it.price;
  renderSaleItemRows();
}
function removeSaleItem(i) { tempSaleItems.splice(i,1); renderSaleItemRows(); }

function recalcSale() {
  const sub = tempSaleItems.reduce((s,i)=>s+i.total,0);
  const total = sub - saleForm.disc + saleForm.tax;
  const rem = total - saleForm.paid;
  if ($('#saleSubtotal')) $('#saleSubtotal').textContent = fmt(sub);
  if ($('#saleDiscDisp')) $('#saleDiscDisp').textContent = fmt(saleForm.disc);
  if ($('#saleTaxDisp')) $('#saleTaxDisp').textContent = fmt(saleForm.tax);
  if ($('#saleTotal')) $('#saleTotal').textContent = fmt(total);
  if ($('#saleRemaining')) $('#saleRemaining').textContent = fmt(rem);
}

async function saveSale() {
  // ✅ اقرأ من DOM مباشرة (الأحدث) مع الـ state كاحتياطي
  const pPaidEl = document.getElementById('salePaid');
  const pDiscEl = document.getElementById('saleDiscount');
  const pTaxEl = document.getElementById('saleTax');

  const paid = pPaidEl ? parseNum(pPaidEl.value) : saleForm.paid;
  const disc = pDiscEl ? parseNum(pDiscEl.value) : saleForm.disc;
  const tax = pTaxEl ? parseNum(pTaxEl.value) : saleForm.tax;

  const customerName = readStr('#saleCustomer');
  const date = readStr('#saleDate');
  const type = readStr('#saleType', 'cash');
  const notes = readStr('#saleNotes');

  console.log('🔍 [SALE] DOM read:', { paid, disc, tax, domPaid: pPaidEl?.value, stateFallback: {...saleForm} });

  if (!customerName) { alert('اكتب اسم العميل'); return; }

  const validItems = tempSaleItems.filter(i => i.itemId && i.qty > 0);
  if (!validItems.length) { alert('أضف صنفاً واحداً على الأقل'); return; }

  const sub = validItems.reduce((s,i)=>s+i.total,0);
  const total = sub - disc + tax;
  const remaining = total - paid;

  console.log('💰 [SALE] FINAL:', { sub, disc, tax, total, paid, remaining });

  let customer = state.data.customers.find(c => c.name.trim() === customerName);
  let customerId = customer?.id;
  if (!customer) {
    const ref = await userCol('customers').add({
      name: customerName, phone: '', address: '',
      openingBalance: 0, createdAt: Date.now()
    });
    customerId = ref.id;
  }

  const number = await nextNumber('sales', 'S');
  await userCol('sales').add({
    number, date, type,
    customerId, customerName,
    items: validItems, subtotal: sub, discount: disc, tax, total, paid,
    remaining: remaining,
    notes, createdAt: Date.now()
  });

  const batch = db.batch();
  validItems.forEach(it => {
    batch.update(userCol('items').doc(it.itemId), {
      quantity: firebase.firestore.FieldValue.increment(-it.qty)
    });
  });
  await batch.commit();

  closeModal();
}

async function deleteSale(id) {
  if (!confirm('حذف الفاتورة وإرجاع المخزون؟')) return;
  const sale = state.data.sales.find(s => s.id === id);
  if (!sale) return;
  const batch = db.batch();
  sale.items?.forEach(it => {
    if (it.itemId) {
      batch.update(userCol('items').doc(it.itemId), { quantity: firebase.firestore.FieldValue.increment(it.qty) });
    }
  });
  batch.update(userCol('sales').doc(id), { deleted: true, deletedAt: Date.now() });
  await batch.commit();
}

function printSale(id) {
  const s = state.data.sales.find(x => x.id === id);
  if (!s) return;
  const html = `
    ${printHeaderHtml('فاتورة بيع')}
    <div class="print-meta">
      <div><strong>رقم الفاتورة:</strong> ${esc(s.number)}</div>
      <div><strong>التاريخ:</strong> ${esc(s.date)}</div>
      <div><strong>النوع:</strong> ${s.type==='cash'?'نقدي':'آجل'}</div>
      <div><strong>العميل:</strong> ${esc(s.customerName)}</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
      <tbody>${(s.items||[]).map((it, i)=>`<tr><td>${i+1}</td><td>${esc(it.name)}</td><td>${it.qty}</td><td>${fmt(it.price)}</td><td>${fmt(it.total)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="print-totals">
      <div><span>المجموع الفرعي:</span> <strong>${fmt(s.subtotal)}</strong></div>
      <div><span>الخصم:</span> <strong>${fmt(s.discount)}</strong></div>
      <div><span>الضريبة:</span> <strong>${fmt(s.tax)}</strong></div>
      <div class="grand"><span>الإجمالي:</span> <strong>${fmt(s.total)}</strong></div>
      <div><span>المدفوع:</span> <strong>${fmt(s.paid)}</strong></div>
      <div><span>المتبقي:</span> <strong>${fmt(s.remaining)}</strong></div>
    </div>
    ${s.notes ? `<div class="print-notes"><strong>ملاحظات:</strong> ${esc(s.notes)}</div>` : ''}
    ${printFooterHtml()}
  `;
  printHtml(html);
}

function printSalesList() {
  const list = [...state.data.sales].sort((a,b)=>b.createdAt-a.createdAt);
  if (!list.length) return;
  const total = list.reduce((s,x)=>s+(Number(x.total)||0),0);
  const paid = list.reduce((s,x)=>s+(Number(x.paid)||0),0);
  const rem = list.reduce((s,x)=>s+(Number(x.remaining)||0),0);
  const html = `
    ${printHeaderHtml('تقرير فواتير البيع')}
    <table>
      <thead><tr><th>#</th><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>النوع</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
      <tbody>${list.map((s, i)=>`<tr>
        <td>${i+1}</td><td>${esc(s.number)}</td><td>${esc(s.date)}</td>
        <td>${esc(s.customerName)}</td><td>${s.type==='cash'?'نقدي':'آجل'}</td>
        <td>${fmt(s.total)}</td><td>${fmt(s.paid)}</td><td>${fmt(s.remaining)}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr style="background:#f0f0f0;font-weight:bold;">
        <td colspan="5">الإجمالي</td><td>${fmt(total)}</td><td>${fmt(paid)}</td><td>${fmt(rem)}</td>
      </tr></tfoot>
    </table>
    ${printFooterHtml()}
  `;
  printHtml(html);
}

/* ===================== PURCHASES ===================== */
function renderPurchases(c) {
  const q = (state.filters.purchases || '').toLowerCase();
  const list = [...state.data.purchases]
    .filter(p => !q || (p.number||'').toLowerCase().includes(q) || (p.supplierName||'').toLowerCase().includes(q))
    .sort((a,b)=>b.createdAt-a.createdAt);

  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" placeholder="🔍 بحث برقم الفاتورة أو المورد..." value="${esc(state.filters.purchases||'')}" oninput="setFilter('purchases',this.value)">
      </div>
      <div class="toolbar-right">
        ${list.length ? `<button class="btn btn-secondary" onclick="printPurchasesList()">🖨️ طباعة القائمة</button>` : ''}
        <button class="btn btn-primary" onclick="openPurchaseForm()">+ فاتورة شراء جديدة</button>
      </div>
    </div>
    <div class="card">
      ${list.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>الرقم</th><th>التاريخ</th><th>المورد</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>إجراءات</th></tr></thead>
        <tbody>${list.map(p => `
          <tr>
            <td><strong>${esc(p.number)}</strong></td><td>${esc(p.date)}</td>
            <td>${esc(p.supplierName||'-')}</td><td>${fmt(p.total)}</td>
            <td>${fmt(p.paid)}</td><td>${fmt(p.remaining)}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="printPurchase('${p.id}')">🖨️</button>
              <button class="btn btn-danger btn-sm" onclick="deletePurchase('${p.id}')">🗑️</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">📥</div>لا توجد فواتير شراء</div>`}
    </div>
  `;
}

let tempPurchaseItems = [];

function openPurchaseForm() {
  tempPurchaseItems = [];
  purchaseForm = { disc: 0, tax: 0, paid: 0 };
  openModal('فاتورة شراء جديدة', `
    <div class="form-row">
      <div class="form-group"><label>التاريخ</label><input type="date" id="pDate" value="${today()}"></div>
      <div class="form-group">
        <label>المورد * <small style="color:#64748b;font-weight:400;">(جديد أو موجود)</small></label>
        <input list="customersListP" id="pSupplier" placeholder="اكتب أو اختر اسم المورد..." autocomplete="off">
        <datalist id="customersListP">
          ${state.data.customers.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}
        </datalist>
      </div>
    </div>
    <div class="form-group"><label>الأصناف <small style="color:#64748b;font-weight:400;">(اكتب اسمًا جديدًا أو اختر موجودًا)</small></label>
      <div id="pItemsContainer"></div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="addPurchaseItemRow()">+ إضافة صنف</button>
    </div>
    <div class="form-row-3">
      <div class="form-group"><label>الخصم</label>
        <input type="text" inputmode="decimal" id="pDiscount" value="0" oninput="onPurchaseField('disc', this.value)"></div>
      <div class="form-group"><label>الضريبة</label>
        <input type="text" inputmode="decimal" id="pTax" value="0" oninput="onPurchaseField('tax', this.value)"></div>
      <div class="form-group"><label>المدفوع</label>
        <input type="text" inputmode="decimal" id="pPaid" value="0" oninput="onPurchaseField('paid', this.value)"></div>
    </div>
    <div class="form-group"><label>ملاحظات</label><textarea id="pNotes" rows="2"></textarea></div>
    <div class="totals-box">
      <div class="totals-row"><span>المجموع الفرعي:</span><strong id="pSubtotal">0</strong></div>
      <div class="totals-row grand"><span>الإجمالي:</span><strong id="pTotal">0</strong></div>
      <div class="totals-row"><span>المتبقي:</span><strong id="pRemaining">0</strong></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="savePurchase()">💾 حفظ</button>
    </div>
  `);
  addPurchaseItemRow();
}

function addPurchaseItemRow() {
  tempPurchaseItems.push({ itemId:'', itemName:'', qty:1, price:0, total:0 });
  renderPurchaseItemRows();
}

function renderPurchaseItemRows() {
  const cont = $('#pItemsContainer');
  if (!cont) return;
  const items = state.data.items;
  cont.innerHTML = tempPurchaseItems.map((it, i) => `
    <div class="item-row">
      <input list="itemsListP" placeholder="اكتب أو اختر اسم الصنف..." 
             value="${esc(it.itemName)}" 
             onchange="updatePurchaseItem(${i},'itemName',this.value)" autocomplete="off">
      <input type="number" min="1" value="${it.qty}" 
             onchange="updatePurchaseItem(${i},'qty',this.value)" placeholder="الكمية">
      <input type="number" min="0" step="0.01" value="${it.price}" 
             onchange="updatePurchaseItem(${i},'price',this.value)" placeholder="سعر التكلفة">
      <span class="row-total">${fmt(it.total)}</span>
      <button class="row-remove" onclick="removePurchaseItem(${i})">×</button>
    </div>
  `).join('') + `
    <datalist id="itemsListP">
      ${items.map(x=>`<option value="${esc(x.name)}"></option>`).join('')}
    </datalist>
  `;
  recalcPurchase();
}

function updatePurchaseItem(i, field, val) {
  const it = tempPurchaseItems[i];
  if (!it) return;
  if (field === 'itemName') {
    it.itemName = val.trim();
    const existing = state.data.items.find(x => x.name.trim().toLowerCase() === it.itemName.toLowerCase());
    if (existing && !it.price) it.price = Number(existing.cost) || 0;
    it.itemId = existing?.id || '';
  } else if (field === 'qty') it.qty = Math.max(0, Number(val) || 0);
  else if (field === 'price') it.price = Math.max(0, Number(val) || 0);
  it.total = it.qty * it.price;
  renderPurchaseItemRows();
}

function removePurchaseItem(i) { tempPurchaseItems.splice(i,1); renderPurchaseItemRows(); }

function recalcPurchase() {
  const sub = tempPurchaseItems.reduce((s,i)=>s+i.total,0);
  const total = sub - purchaseForm.disc + purchaseForm.tax;
  if ($('#pSubtotal')) $('#pSubtotal').textContent = fmt(sub);
  if ($('#pTotal')) $('#pTotal').textContent = fmt(total);
  if ($('#pRemaining')) $('#pRemaining').textContent = fmt(total - purchaseForm.paid);
}

async function savePurchase() {
  // ✅ اقرأ من DOM مباشرة (الأحدث)
  const pPaidEl = document.getElementById('pPaid');
  const pDiscEl = document.getElementById('pDiscount');
  const pTaxEl = document.getElementById('pTax');

  const paid = pPaidEl ? parseNum(pPaidEl.value) : purchaseForm.paid;
  const disc = pDiscEl ? parseNum(pDiscEl.value) : purchaseForm.disc;
  const tax = pTaxEl ? parseNum(pTaxEl.value) : purchaseForm.tax;

  const supplierName = readStr('#pSupplier');
  const date = readStr('#pDate');
  const notes = readStr('#pNotes');

  console.log('🔍 [PURCHASE] DOM read:', { paid, disc, tax, domPaid: pPaidEl?.value, stateFallback: {...purchaseForm} });

  if (!supplierName) { alert('اكتب اسم المورد'); return; }

  const validItems = tempPurchaseItems.filter(i => i.itemName && i.qty > 0);
  if (!validItems.length) { alert('أضف صنفاً واحداً على الأقل'); return; }

  const sub = validItems.reduce((s,i)=>s+i.total,0);
  const total = sub - disc + tax;
  const remaining = total - paid;

  console.log('💰 [PURCHASE] FINAL:', { sub, disc, tax, total, paid, remaining });

  let supplier = state.data.customers.find(c => c.name.trim() === supplierName);
  let supplierId = supplier?.id;
  if (!supplier) {
    const ref = await userCol('customers').add({
      name: supplierName, phone: '', address: '',
      openingBalance: 0, createdAt: Date.now()
    });
    supplierId = ref.id;
  }

  const finalItems = [];
  const inventoryUpdates = [];
  for (const it of validItems) {
    let existing = state.data.items.find(x => x.name.trim().toLowerCase() === it.itemName.trim().toLowerCase());
    let itemId = existing?.id;
    if (!existing) {
      const ref = await userCol('items').add({
        name: it.itemName.trim(), code: '', unit: '',
        quantity: 0,
        cost: it.price,
        price: Math.round(it.price * 1.2 * 100) / 100,
        minQuantity: 0, notes: '', createdAt: Date.now()
      });
      itemId = ref.id;
    }
    finalItems.push({ itemId, name: it.itemName.trim(), qty: it.qty, price: it.price, total: it.total });
    inventoryUpdates.push({ itemId, qty: it.qty, cost: it.price });
  }

  const number = await nextNumber('purchases', 'P');
  await userCol('purchases').add({
    number, date,
    supplierId, supplierName,
    items: finalItems, subtotal: sub, discount: disc, tax, total, paid,
    remaining: remaining,
    notes, createdAt: Date.now()
  });

  const batch = db.batch();
  inventoryUpdates.forEach(u => {
    batch.update(userCol('items').doc(u.itemId), {
      quantity: firebase.firestore.FieldValue.increment(u.qty),
      cost: u.cost
    });
  });
  await batch.commit();

  closeModal();
}

async function deletePurchase(id) {
  if (!confirm('حذف الفاتورة وإرجاع الكميات؟')) return;
  const p = state.data.purchases.find(x => x.id === id);
  if (!p) return;
  const batch = db.batch();
  p.items?.forEach(it => {
    if (it.itemId) batch.update(userCol('items').doc(it.itemId), { quantity: firebase.firestore.FieldValue.increment(-it.qty) });
  });
  batch.update(userCol('purchases').doc(id), { deleted: true, deletedAt: Date.now() });
  await batch.commit();
}

function printPurchase(id) {
  const p = state.data.purchases.find(x => x.id === id);
  if (!p) return;
  const html = `
    ${printHeaderHtml('فاتورة شراء')}
    <div class="print-meta">
      <div><strong>رقم الفاتورة:</strong> ${esc(p.number)}</div>
      <div><strong>التاريخ:</strong> ${esc(p.date)}</div>
      <div><strong>المورد:</strong> ${esc(p.supplierName)}</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
      <tbody>${(p.items||[]).map((it, i)=>`<tr><td>${i+1}</td><td>${esc(it.name)}</td><td>${it.qty}</td><td>${fmt(it.price)}</td><td>${fmt(it.total)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="print-totals">
      <div><span>المجموع الفرعي:</span> <strong>${fmt(p.subtotal)}</strong></div>
      <div><span>الخصم:</span> <strong>${fmt(p.discount)}</strong></div>
      <div><span>الضريبة:</span> <strong>${fmt(p.tax)}</strong></div>
      <div class="grand"><span>الإجمالي:</span> <strong>${fmt(p.total)}</strong></div>
      <div><span>المدفوع:</span> <strong>${fmt(p.paid)}</strong></div>
      <div><span>المتبقي:</span> <strong>${fmt(p.remaining)}</strong></div>
    </div>
    ${p.notes ? `<div class="print-notes"><strong>ملاحظات:</strong> ${esc(p.notes)}</div>` : ''}
    ${printFooterHtml()}
  `;
  printHtml(html);
}

function printPurchasesList() {
  const list = [...state.data.purchases].sort((a,b)=>b.createdAt-a.createdAt);
  if (!list.length) return;
  const total = list.reduce((s,x)=>s+(Number(x.total)||0),0);
  const paid = list.reduce((s,x)=>s+(Number(x.paid)||0),0);
  const rem = list.reduce((s,x)=>s+(Number(x.remaining)||0),0);
  const html = `
    ${printHeaderHtml('تقرير فواتير الشراء')}
    <table>
      <thead><tr><th>#</th><th>الرقم</th><th>التاريخ</th><th>المورد</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
      <tbody>${list.map((p, i)=>`<tr>
        <td>${i+1}</td><td>${esc(p.number)}</td><td>${esc(p.date)}</td>
        <td>${esc(p.supplierName)}</td>
        <td>${fmt(p.total)}</td><td>${fmt(p.paid)}</td><td>${fmt(p.remaining)}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr style="background:#f0f0f0;font-weight:bold;">
        <td colspan="4">الإجمالي</td><td>${fmt(total)}</td><td>${fmt(paid)}</td><td>${fmt(rem)}</td>
      </tr></tfoot>
    </table>
    ${printFooterHtml()}
  `;
  printHtml(html);
}

/* ===================== CUSTOMERS ===================== */
function renderCustomers(c) {
  const q = (state.filters.customers || '').toLowerCase();
  const list = state.data.customers.filter(x => !q || (x.name||'').toLowerCase().includes(q));

  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" placeholder="🔍 بحث بالاسم..." value="${esc(state.filters.customers||'')}" oninput="setFilter('customers',this.value)">
      </div>
      <div class="toolbar-right">
        ${list.length ? `<button class="btn btn-secondary" onclick="printCustomersList()">🖨️ طباعة القائمة</button>` : ''}
        <button class="btn btn-primary" onclick="openCustomerForm()">+ إضافة طرف جديد</button>
      </div>
    </div>
    <div class="card">
      <h3>👥 العملاء والموردون <small style="color:#64748b;font-weight:400;font-size:13px;">(الأرصدة تُحسب تلقائيًا)</small></h3>
      ${list.length ? `
      <div class="table-wrap"><table>
        <thead><tr>
          <th>الاسم</th><th>الهاتف</th>
          <th>بيع آجل</th><th>شراء آجل</th>
          <th>قبض</th><th>صرف</th>
          <th>الرصيد الصافي</th>
          <th>إجراءات</th>
        </tr></thead>
        <tbody>${list.map(cu => {
          const bal = customerBalance(cu.id);
          const salesRem = state.data.sales.filter(s => s.customerId === cu.id)
            .reduce((s,x)=>s+(Number(x.remaining)||0),0);
          const purchRem = state.data.purchases.filter(p => p.supplierId === cu.id)
            .reduce((s,x)=>s+(Number(x.remaining)||0),0);
          const rec = state.data.receipts.filter(r => r.customerId === cu.id)
            .reduce((s,x)=>s+(Number(x.amount)||0),0);
          const pay = state.data.payments.filter(p => p.partyId === cu.id)
            .reduce((s,x)=>s+(Number(x.amount)||0),0);

          const balLabel = bal > 0 ? 'مدين لنا' : bal < 0 ? 'دائن (لنا عنده)' : 'متعادل';
          const balClass = bal > 0 ? 'badge-red' : bal < 0 ? 'badge-green' : 'badge-gray';

          return `<tr>
            <td><strong>${esc(cu.name)}</strong></td>
            <td>${esc(cu.phone||'-')}</td>
            <td>${fmt(salesRem)}</td>
            <td>${fmt(purchRem)}</td>
            <td>${fmt(rec)}</td>
            <td>${fmt(pay)}</td>
            <td><span class="badge ${balClass}">${fmt(Math.abs(bal))} — ${balLabel}</span></td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="printCustomerStatement('${cu.id}')">🖨️</button>
              <button class="btn btn-secondary btn-sm" onclick="openCustomerForm('${cu.id}')">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="softDelete('customers','${cu.id}')">🗑️</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">👥</div>لا توجد بيانات</div>`}
    </div>
  `;
}

function printCustomersList() {
  const list = state.data.customers;
  if (!list.length) return;
  const html = `
    ${printHeaderHtml('تقرير العملاء والموردين')}
    <table>
      <thead><tr><th>#</th><th>الاسم</th><th>الهاتف</th><th>العنوان</th><th>الرصيد</th><th>الحالة</th></tr></thead>
      <tbody>${list.map((cu, i) => {
        const bal = customerBalance(cu.id);
        const label = bal > 0 ? 'مدين لنا' : bal < 0 ? 'دائن (لنا عنده)' : 'متعادل';
        return `<tr><td>${i+1}</td><td>${esc(cu.name)}</td><td>${esc(cu.phone||'-')}</td>
          <td>${esc(cu.address||'-')}</td><td>${fmt(Math.abs(bal))}</td><td>${label}</td></tr>`;
      }).join('')}</tbody>
    </table>
    ${printFooterHtml()}
  `;
  printHtml(html);
}

function printCustomerStatement(custId) {
  const cu = state.data.customers.find(x => x.id === custId);
  if (!cu) return;

  const sales = state.data.sales.filter(s => s.customerId === custId);
  const purchases = state.data.purchases.filter(p => p.supplierId === custId);
  const receipts = state.data.receipts.filter(r => r.customerId === custId);
  const payments = state.data.payments.filter(p => p.partyId === custId);

  const movements = [
    ...sales.map(s => ({ date: s.date, type: 'فاتورة بيع', number: s.number, debit: Number(s.total)||0, credit: Number(s.paid)||0 })),
    ...purchases.map(p => ({ date: p.date, type: 'فاتورة شراء', number: p.number, debit: Number(p.paid)||0, credit: Number(p.total)||0 })),
    ...receipts.map(r => ({ date: r.date, type: 'سند قبض', number: r.number, debit: 0, credit: Number(r.amount)||0 })),
    ...payments.map(p => ({ date: p.date, type: 'سند صرف', number: p.number, debit: Number(p.amount)||0, credit: 0 }))
  ].sort((a,b)=> (a.date||'').localeCompare(b.date||''));

  let running = Number(cu.openingBalance)||0;
  const rows = movements.map((m, i) => {
    running += m.debit - m.credit;
    return `<tr>
      <td>${i+1}</td>
      <td>${esc(m.date)}</td>
      <td>${esc(m.type)}</td>
      <td>${esc(m.number)}</td>
      <td>${m.debit ? fmt(m.debit) : '-'}</td>
      <td>${m.credit ? fmt(m.credit) : '-'}</td>
      <td>${fmt(running)}</td>
    </tr>`;
  }).join('');

  const html = `
    ${printHeaderHtml('كشف حساب')}
    <div class="print-meta">
      <div><strong>الاسم:</strong> ${esc(cu.name)}</div>
      <div><strong>الهاتف:</strong> ${esc(cu.phone||'-')}</div>
      <div><strong>الرصيد الافتتاحي:</strong> ${fmt(cu.openingBalance)}</div>
      <div><strong>الرصيد الحالي:</strong> ${fmt(customerBalance(custId))}</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>التاريخ</th><th>النوع</th><th>الرقم</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center;">لا توجد حركات</td></tr>'}</tbody>
    </table>
    ${printFooterHtml()}
  `;
  printHtml(html);
}

function openCustomerForm(id) {
  const cu = id ? state.data.customers.find(x => x.id === id) : null;
  openModal(cu ? 'تعديل طرف' : 'طرف جديد', `
    <div class="form-group"><label>الاسم *</label><input id="cuName" value="${esc(cu?.name||'')}"></div>
    <div class="form-row">
      <div class="form-group"><label>الهاتف</label><input id="cuPhone" value="${esc(cu?.phone||'')}"></div>
      <div class="form-group"><label>الرصيد الافتتاحي</label><input type="number" id="cuOpening" value="${cu?.openingBalance||0}" step="0.01"></div>
    </div>
    <div class="form-group"><label>العنوان</label><input id="cuAddress" value="${esc(cu?.address||'')}"></div>
    <div class="form-group"><label>ملاحظات</label><textarea id="cuNotes" rows="2">${esc(cu?.notes||'')}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="saveCustomer(${cu ? `'${cu.id}'` : 'null'})">💾 حفظ</button>
    </div>
  `);
}

async function saveCustomer(id) {
  const name = readStr('#cuName');
  if (!name) { alert('الاسم مطلوب'); return; }
  const data = {
    name,
    phone: readStr('#cuPhone'),
    address: readStr('#cuAddress'),
    openingBalance: readNum('#cuOpening'),
    notes: readStr('#cuNotes'),
    updatedAt: Date.now()
  };
  if (id) await userCol('customers').doc(id).update(data);
  else await userCol('customers').add({ ...data, createdAt: Date.now() });
  closeModal();
}

/* ===================== ITEMS ===================== */
function renderItems(c) {
  const q = (state.filters.items || '').toLowerCase();
  const list = state.data.items.filter(x => !q || (x.name||'').toLowerCase().includes(q) || (x.code||'').toLowerCase().includes(q));

  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" placeholder="🔍 بحث بالاسم أو الكود..." value="${esc(state.filters.items||'')}" oninput="setFilter('items',this.value)">
      </div>
      <div class="toolbar-right">
        ${list.length ? `<button class="btn btn-secondary" onclick="printItemsList()">🖨️ طباعة القائمة</button>` : ''}
        <button class="btn btn-primary" onclick="openItemForm()">+ صنف جديد</button>
      </div>
    </div>
    <div class="card">
      <h3>📦 الأصناف والمخزون</h3>
      ${list.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>الكود</th><th>الاسم</th><th>الوحدة</th><th>سعر التكلفة</th><th>سعر البيع</th><th>الكمية</th><th>الحد الأدنى</th><th>إجراءات</th></tr></thead>
        <tbody>${list.map(i => {
          const low = Number(i.quantity) <= Number(i.minQuantity || 0);
          return `<tr>
            <td>${esc(i.code||'-')}</td>
            <td><strong>${esc(i.name)}</strong></td>
            <td>${esc(i.unit||'-')}</td>
            <td>${fmt(i.cost)}</td>
            <td>${fmt(i.price)}</td>
            <td><span class="badge ${low?'badge-red':'badge-green'}">${i.quantity||0}</span></td>
            <td>${i.minQuantity||0}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="openItemForm('${i.id}')">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="softDelete('items','${i.id}')">🗑️</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">📦</div>لا توجد أصناف</div>`}
    </div>
  `;
}

function printItemsList() {
  const list = state.data.items;
  if (!list.length) return;
  const totalValue = list.reduce((s,x)=>s+((Number(x.quantity)||0)*(Number(x.cost)||0)),0);
  const html = `
    ${printHeaderHtml('تقرير الأصناف والمخزون')}
    <table>
      <thead><tr><th>#</th><th>الكود</th><th>الاسم</th><th>الوحدة</th><th>التكلفة</th><th>سعر البيع</th><th>الكمية</th><th>قيمة المخزون</th></tr></thead>
      <tbody>${list.map((it, i)=>`<tr>
        <td>${i+1}</td><td>${esc(it.code||'-')}</td><td>${esc(it.name)}</td>
        <td>${esc(it.unit||'-')}</td><td>${fmt(it.cost)}</td><td>${fmt(it.price)}</td>
        <td>${it.quantity||0}</td><td>${fmt((Number(it.quantity)||0)*(Number(it.cost)||0))}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr style="background:#f0f0f0;font-weight:bold;">
        <td colspan="7">إجمالي قيمة المخزون</td><td>${fmt(totalValue)}</td>
      </tr></tfoot>
    </table>
    ${printFooterHtml()}
  `;
  printHtml(html);
}

function openItemForm(id) {
  const it = id ? state.data.items.find(x => x.id === id) : null;
  openModal(it ? 'تعديل صنف' : 'صنف جديد', `
    <div class="form-row">
      <div class="form-group"><label>الكود</label><input id="itCode" value="${esc(it?.code||'')}"></div>
      <div class="form-group"><label>الاسم *</label><input id="itName" value="${esc(it?.name||'')}"></div>
    </div>
    <div class="form-row-3">
      <div class="form-group"><label>الوحدة</label><input id="itUnit" value="${esc(it?.unit||'')}" placeholder="قطعة، كيلو..."></div>
      <div class="form-group"><label>سعر التكلفة</label><input type="number" id="itCost" value="${it?.cost||0}" step="0.01"></div>
      <div class="form-group"><label>سعر البيع</label><input type="number" id="itPrice" value="${it?.price||0}" step="0.01"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>الكمية الحالية</label><input type="number" id="itQty" value="${it?.quantity||0}" step="1" ${it?'disabled':''}></div>
      <div class="form-group"><label>الحد الأدنى</label><input type="number" id="itMin" value="${it?.minQuantity||0}" step="1"></div>
    </div>
    <div class="form-group"><label>ملاحظات</label><textarea id="itNotes" rows="2">${esc(it?.notes||'')}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="saveItem(${it ? `'${it.id}'` : 'null'})">💾 حفظ</button>
    </div>
  `);
}

async function saveItem(id) {
  const name = readStr('#itName');
  if (!name) { alert('الاسم مطلوب'); return; }
  const data = {
    code: readStr('#itCode'),
    name,
    unit: readStr('#itUnit'),
    cost: readNum('#itCost'),
    price: readNum('#itPrice'),
    minQuantity: readNum('#itMin'),
    notes: readStr('#itNotes'),
    updatedAt: Date.now()
  };
  if (id) {
    await userCol('items').doc(id).update(data);
  } else {
    data.quantity = readNum('#itQty');
    data.createdAt = Date.now();
    await userCol('items').add(data);
  }
  closeModal();
}

/* ===================== EMPLOYEES ===================== */
function renderEmployees(c) {
  const q = (state.filters.employees || '').toLowerCase();
  const list = state.data.employees.filter(x => !q || (x.name||'').toLowerCase().includes(q));

  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" placeholder="🔍 بحث بالاسم..." value="${esc(state.filters.employees||'')}" oninput="setFilter('employees',this.value)">
      </div>
      <div class="toolbar-right">
        ${list.length ? `<button class="btn btn-secondary" onclick="printEmployeesList()">🖨️ طباعة القائمة</button>` : ''}
        <button class="btn btn-primary" onclick="openEmployeeForm()">+ موظف جديد</button>
      </div>
    </div>
    <div class="card">
      ${list.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>الاسم</th><th>الوظيفة</th><th>الهاتف</th><th>الراتب الأساسي</th><th>البدلات</th><th>الإجمالي</th><th>إجراءات</th></tr></thead>
        <tbody>${list.map(e => `
          <tr>
            <td><strong>${esc(e.name)}</strong></td>
            <td>${esc(e.position||'-')}</td>
            <td>${esc(e.phone||'-')}</td>
            <td>${fmt(e.basicSalary)}</td>
            <td>${fmt(e.allowances)}</td>
            <td>${fmt((Number(e.basicSalary)||0) + (Number(e.allowances)||0))}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="openEmployeeForm('${e.id}')">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="softDelete('employees','${e.id}')">🗑️</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">👨‍💼</div>لا يوجد موظفون</div>`}
    </div>
  `;
}

function printEmployeesList() {
  const list = state.data.employees;
  if (!list.length) return;
  const totalBasic = list.reduce((s,x)=>s+(Number(x.basicSalary)||0),0);
  const totalAllow = list.reduce((s,x)=>s+(Number(x.allowances)||0),0);
  const html = `
    ${printHeaderHtml('تقرير الموظفين')}
    <table>
      <thead><tr><th>#</th><th>الاسم</th><th>الوظيفة</th><th>الهاتف</th><th>الأساسي</th><th>البدلات</th><th>الإجمالي</th></tr></thead>
      <tbody>${list.map((e,i)=>`<tr>
        <td>${i+1}</td><td>${esc(e.name)}</td><td>${esc(e.position||'-')}</td>
        <td>${esc(e.phone||'-')}</td><td>${fmt(e.basicSalary)}</td>
        <td>${fmt(e.allowances)}</td>
        <td>${fmt((Number(e.basicSalary)||0)+(Number(e.allowances)||0))}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr style="background:#f0f0f0;font-weight:bold;">
        <td colspan="4">الإجمالي</td><td>${fmt(totalBasic)}</td><td>${fmt(totalAllow)}</td><td>${fmt(totalBasic+totalAllow)}</td>
      </tr></tfoot>
    </table>
    ${printFooterHtml()}
  `;
  printHtml(html);
}

function openEmployeeForm(id) {
  const e = id ? state.data.employees.find(x => x.id === id) : null;
  openModal(e ? 'تعديل موظف' : 'موظف جديد', `
    <div class="form-row">
      <div class="form-group"><label>الاسم *</label><input id="emName" value="${esc(e?.name||'')}"></div>
      <div class="form-group"><label>الوظيفة</label><input id="emPos" value="${esc(e?.position||'')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>الهاتف</label><input id="emPhone" value="${esc(e?.phone||'')}"></div>
      <div class="form-group"><label>تاريخ التعيين</label><input type="date" id="emHire" value="${e?.hireDate||today()}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>الراتب الأساسي</label><input type="number" id="emBasic" value="${e?.basicSalary||0}" step="0.01"></div>
      <div class="form-group"><label>البدلات</label><input type="number" id="emAllow" value="${e?.allowances||0}" step="0.01"></div>
    </div>
    <div class="form-group"><label>ملاحظات</label><textarea id="emNotes" rows="2">${esc(e?.notes||'')}</textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="saveEmployee(${e ? `'${e.id}'` : 'null'})">💾 حفظ</button>
    </div>
  `);
}

async function saveEmployee(id) {
  const name = readStr('#emName');
  if (!name) { alert('الاسم مطلوب'); return; }
  const data = {
    name,
    position: readStr('#emPos'),
    phone: readStr('#emPhone'),
    hireDate: readStr('#emHire'),
    basicSalary: readNum('#emBasic'),
    allowances: readNum('#emAllow'),
    notes: readStr('#emNotes'),
    updatedAt: Date.now()
  };
  if (id) await userCol('employees').doc(id).update(data);
  else await userCol('employees').add({ ...data, createdAt: Date.now() });
  closeModal();
}

/* ===================== ADVANCES ===================== */
function renderAdvances(c) {
  const list = [...state.data.advances].sort((a,b)=>b.createdAt-a.createdAt);
  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left"><h3>سلف الموظفين</h3></div>
      <div class="toolbar-right">
        ${list.length ? `<button class="btn btn-secondary" onclick="printAdvancesList()">🖨️ طباعة القائمة</button>` : ''}
        <button class="btn btn-primary" onclick="openAdvanceForm()">+ سلفة جديدة</button>
      </div>
    </div>
    <div class="card">
      ${list.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>الرقم</th><th>التاريخ</th><th>الموظف</th><th>المبلغ</th><th>ملاحظات</th><th>إجراءات</th></tr></thead>
        <tbody>${list.map(a => `
          <tr>
            <td>${esc(a.number)}</td><td>${esc(a.date)}</td>
            <td>${esc(a.employeeName)}</td>
            <td>${fmt(a.amount)}</td>
            <td>${esc(a.notes||'-')}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="printAdvance('${a.id}')">🖨️</button>
              <button class="btn btn-danger btn-sm" onclick="softDelete('advances','${a.id}')">🗑️</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">💵</div>لا توجد سلف</div>`}
    </div>
  `;
}

function printAdvancesList() {
  const list = [...state.data.advances].sort((a,b)=>b.createdAt-a.createdAt);
  if (!list.length) return;
  const total = list.reduce((s,x)=>s+(Number(x.amount)||0),0);
  const html = `
    ${printHeaderHtml('تقرير سلف الموظفين')}
    <table>
      <thead><tr><th>#</th><th>الرقم</th><th>التاريخ</th><th>الموظف</th><th>المبلغ</th><th>ملاحظات</th></tr></thead>
      <tbody>${list.map((a,i)=>`<tr>
        <td>${i+1}</td><td>${esc(a.number)}</td><td>${esc(a.date)}</td>
        <td>${esc(a.employeeName)}</td><td>${fmt(a.amount)}</td><td>${esc(a.notes||'-')}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr style="background:#f0f0f0;font-weight:bold;">
        <td colspan="4">الإجمالي</td><td>${fmt(total)}</td><td></td>
      </tr></tfoot>
    </table>
    ${printFooterHtml()}
  `;
  printHtml(html);
}

function printAdvance(id) {
  const a = state.data.advances.find(x => x.id === id);
  if (!a) return;
  const html = `
    ${printHeaderHtml('سند سلفة')}
    <div class="print-meta">
      <div><strong>الرقم:</strong> ${esc(a.number)}</div>
      <div><strong>التاريخ:</strong> ${esc(a.date)}</div>
      <div><strong>الموظف:</strong> ${esc(a.employeeName)}</div>
      <div><strong>المبلغ:</strong> ${fmt(a.amount)}</div>
    </div>
    <div style="margin-top:30px;padding:20px;border:1px solid #ccc;background:#fafafa;">
      <p style="font-size:16px;line-height:2;">
        تم صرف مبلغ <strong>${fmt(a.amount)}</strong> للموظف <strong>${esc(a.employeeName)}</strong> كسلفة على الراتب.
      </p>
      ${a.notes ? `<p><strong>ملاحظات:</strong> ${esc(a.notes)}</p>` : ''}
    </div>
    <div style="margin-top:60px;display:flex;justify-content:space-between;">
      <div>توقيع الموظف: ________________</div>
      <div>توقيع المسؤول: ________________</div>
    </div>
    ${printFooterHtml()}
  `;
  printHtml(html);
}

function openAdvanceForm() {
  if (!state.data.employees.length) { alert('أضف موظفاً أولاً'); return; }
  openModal('سلفة موظف جديدة', `
    <div class="form-row">
      <div class="form-group"><label>التاريخ</label><input type="date" id="advDate" value="${today()}"></div>
      <div class="form-group"><label>الموظف</label>
        <select id="advEmp">${state.data.employees.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select>
      </div>
    </div>
    <div class="form-group"><label>المبلغ *</label><input type="number" id="advAmount" step="0.01" min="0"></div>
    <div class="form-group"><label>ملاحظات</label><textarea id="advNotes" rows="2"></textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="saveAdvance()">💾 حفظ</button>
    </div>
  `);
}

async function saveAdvance() {
  const empId = readStr('#advEmp');
  const date = readStr('#advDate');
  const amount = readNum('#advAmount');
  const notes = readStr('#advNotes');
  const emp = state.data.employees.find(e => e.id === empId);
  if (amount <= 0) { alert('أدخل مبلغاً صحيحاً'); return; }
  const number = await nextNumber('advances', 'ADV');
  await userCol('advances').add({
    number, date, employeeId: empId, employeeName: emp?.name || '',
    amount, notes, createdAt: Date.now()
  });
  closeModal();
}

/* ===================== SALARIES ===================== */
function renderSalaries(c) {
  const month = state.filters.salMonth || monthNow();
  const emps = state.data.employees;

  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <label style="font-size:13px;font-weight:600;">الشهر:</label>
        <input type="month" class="search-input" value="${month}" onchange="state.filters.salMonth=this.value;renderSection()">
      </div>
      <div class="toolbar-right">
        ${emps.length ? `<button class="btn btn-secondary" onclick="printSalariesReport('${month}')">🖨️ طباعة الكشف</button>` : ''}
      </div>
    </div>
    <div class="card">
      <h3>رواتب شهر ${month}</h3>
      ${emps.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>الموظف</th><th>الأساسي</th><th>البدلات</th><th>الإجمالي</th><th>السلف</th><th>المدفوع</th><th>المتبقي</th><th>إجراءات</th></tr></thead>
        <tbody>${emps.map(e => {
          const m = employeeMonthData(e.id, month);
          return `<tr>
            <td><strong>${esc(e.name)}</strong></td>
            <td>${fmt(e.basicSalary)}</td>
            <td>${fmt(e.allowances)}</td>
            <td>${fmt(m.total)}</td>
            <td>${fmt(m.advances)}</td>
            <td>${fmt(m.paid)}</td>
            <td><span class="badge ${m.remaining>0?'badge-orange':'badge-green'}">${fmt(m.remaining)}</span></td>
            <td><button class="btn btn-success btn-sm" onclick="openSalaryForm('${e.id}','${month}')">💼 صرف</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">💼</div>لا يوجد موظفون</div>`}
    </div>
  `;
}

function printSalariesReport(month) {
  const emps = state.data.employees;
  if (!emps.length) return;
  let totals = { total:0, advances:0, paid:0, remaining:0 };
  const rows = emps.map((e, i) => {
    const m = employeeMonthData(e.id, month);
    totals.total += m.total; totals.advances += m.advances; totals.paid += m.paid; totals.remaining += m.remaining;
    return `<tr>
      <td>${i+1}</td><td>${esc(e.name)}</td><td>${esc(e.position||'-')}</td>
      <td>${fmt(e.basicSalary)}</td><td>${fmt(e.allowances)}</td>
      <td>${fmt(m.total)}</td><td>${fmt(m.advances)}</td>
      <td>${fmt(m.paid)}</td><td>${fmt(m.remaining)}</td>
    </tr>`;
  }).join('');
  const html = `
    ${printHeaderHtml('كشف رواتب شهر ' + month)}
    <table>
      <thead><tr><th>#</th><th>الموظف</th><th>الوظيفة</th><th>الأساسي</th><th>البدلات</th><th>الإجمالي</th><th>السلف</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="background:#f0f0f0;font-weight:bold;">
        <td colspan="5">الإجمالي</td>
        <td>${fmt(totals.total)}</td><td>${fmt(totals.advances)}</td>
        <td>${fmt(totals.paid)}</td><td>${fmt(totals.remaining)}</td>
      </tr></tfoot>
    </table>
    ${printFooterHtml()}
  `;
  printHtml(html);
}

function openSalaryForm(empId, month) {
  const emp = state.data.employees.find(e => e.id === empId);
  const m = employeeMonthData(empId, month);
  openModal('صرف راتب - ' + emp.name, `
    <div class="form-row">
      <div class="form-group"><label>الشهر</label><input id="salMonth" value="${month}" readonly></div>
      <div class="form-group"><label>التاريخ</label><input type="date" id="salDate" value="${today()}"></div>
    </div>
    <div class="form-group"><label>المتبقي المستحق</label><input value="${fmt(m.remaining)}" readonly></div>
    <div class="form-group"><label>المبلغ المصروف *</label><input type="number" id="salAmount" step="0.01" value="${Math.max(0, m.remaining)}"></div>
    <div class="form-group"><label>ملاحظات</label><textarea id="salNotes" rows="2"></textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="saveSalary('${empId}')">💾 حفظ</button>
    </div>
  `);
}

async function saveSalary(empId) {
  const emp = state.data.employees.find(e => e.id === empId);
  const amount = readNum('#salAmount');
  const date = readStr('#salDate');
  const month = readStr('#salMonth');
  const notes = readStr('#salNotes');
  if (amount <= 0) { alert('أدخل مبلغاً صحيحاً'); return; }
  const number = await nextNumber('salaries', 'SAL');
  await userCol('salaries').add({
    number, date, month,
    employeeId: empId, employeeName: emp?.name || '',
    net: amount, notes, createdAt: Date.now()
  });
  closeModal();
}

/* ===================== RECEIPTS ===================== */
function renderReceipts(c) {
  const list = [...state.data.receipts].sort((a,b)=>b.createdAt-a.createdAt);
  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left"><h3>سندات القبض</h3></div>
      <div class="toolbar-right">
        ${list.length ? `<button class="btn btn-secondary" onclick="printReceiptsList()">🖨️ طباعة القائمة</button>` : ''}
        <button class="btn btn-primary" onclick="openReceiptForm()">+ سند قبض</button>
      </div>
    </div>
    <div class="card">
      ${list.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>المبلغ</th><th>الطريقة</th><th>ملاحظات</th><th>إجراءات</th></tr></thead>
        <tbody>${list.map(r => `
          <tr>
            <td><strong>${esc(r.number)}</strong></td><td>${esc(r.date)}</td>
            <td>${esc(r.customerName)}</td><td>${fmt(r.amount)}</td>
            <td>${esc(r.method||'-')}</td><td>${esc(r.notes||'-')}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="printReceipt('${r.id}')">🖨️</button>
              <button class="btn btn-danger btn-sm" onclick="softDelete('receipts','${r.id}')">🗑️</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">📨</div>لا توجد سندات</div>`}
    </div>
  `;
}

function printReceipt(id) {
  const r = state.data.receipts.find(x => x.id === id);
  if (!r) return;
  const html = `
    ${printHeaderHtml('سند قبض')}
    <div class="print-meta">
      <div><strong>الرقم:</strong> ${esc(r.number)}</div>
      <div><strong>التاريخ:</strong> ${esc(r.date)}</div>
      <div><strong>العميل:</strong> ${esc(r.customerName)}</div>
      <div><strong>طريقة الدفع:</strong> ${esc(r.method||'-')}</div>
    </div>
    <div style="margin-top:30px;padding:20px;border:1px solid #ccc;background:#fafafa;">
      <p style="font-size:16px;line-height:2;">
        استلمنا من السيد/ <strong>${esc(r.customerName)}</strong> مبلغ وقدره 
        <strong>${fmt(r.amount)}</strong> ${r.method ? `(${esc(r.method)})` : ''}.
      </p>
      ${r.notes ? `<p><strong>ملاحظات:</strong> ${esc(r.notes)}</p>` : ''}
    </div>
    <div style="margin-top:60px;display:flex;justify-content:space-between;">
      <div>توقيع المستلم: ________________</div>
      <div>توقيع الدافع: ________________</div>
    </div>
    ${printFooterHtml()}
  `;
  printHtml(html);
}

function printReceiptsList() {
  const list = [...state.data.receipts].sort((a,b)=>b.createdAt-a.createdAt);
  if (!list.length) return;
  const total = list.reduce((s,x)=>s+(Number(x.amount)||0),0);
  const html = `
    ${printHeaderHtml('تقرير سندات القبض')}
    <table>
      <thead><tr><th>#</th><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>المبلغ</th><th>الطريقة</th><th>ملاحظات</th></tr></thead>
      <tbody>${list.map((r,i)=>`<tr>
        <td>${i+1}</td><td>${esc(r.number)}</td><td>${esc(r.date)}</td>
        <td>${esc(r.customerName)}</td><td>${fmt(r.amount)}</td>
        <td>${esc(r.method||'-')}</td><td>${esc(r.notes||'-')}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr style="background:#f0f0f0;font-weight:bold;">
        <td colspan="4">الإجمالي</td><td>${fmt(total)}</td><td colspan="2"></td>
      </tr></tfoot>
    </table>
    ${printFooterHtml()}
  `;
  printHtml(html);
}

function openReceiptForm() {
  openModal('سند قبض جديد', `
    <div class="form-row">
      <div class="form-group"><label>التاريخ</label><input type="date" id="rDate" value="${today()}"></div>
      <div class="form-group">
        <label>العميل * (اكتب أو اختر)</label>
        <input list="customersListR" id="rCust" placeholder="اكتب أو اختر اسم العميل..." autocomplete="off">
        <datalist id="customersListR">
          ${state.data.customers.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}
        </datalist>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>المبلغ *</label><input type="number" id="rAmount" step="0.01" min="0"></div>
      <div class="form-group"><label>طريقة الدفع</label>
        <select id="rMethod"><option>نقدي</option><option>تحويل بنكي</option><option>شيك</option></select>
      </div>
    </div>
    <div class="form-group"><label>ملاحظات</label><textarea id="rNotes" rows="2"></textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="saveReceipt()">💾 حفظ</button>
    </div>
  `);
}

async function saveReceipt() {
  const name = readStr('#rCust');
  const amount = readNum('#rAmount');
  const date = readStr('#rDate');
  const method = readStr('#rMethod');
  const notes = readStr('#rNotes');
  if (!name || amount <= 0) { alert('أدخل بيانات صحيحة'); return; }

  let customer = state.data.customers.find(c => c.name.trim() === name);
  let customerId = customer?.id;
  if (!customer) {
    const ref = await userCol('customers').add({
      name, phone: '', address: '', openingBalance: 0, createdAt: Date.now()
    });
    customerId = ref.id;
  }

  const number = await nextNumber('receipts', 'RC');
  await userCol('receipts').add({
    number, date, customerId, customerName: name,
    amount, method, notes, createdAt: Date.now()
  });
  closeModal();
}

/* ===================== PAYMENTS ===================== */
function renderPayments(c) {
  const list = [...state.data.payments].sort((a,b)=>b.createdAt-a.createdAt);
  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left"><h3>سندات الصرف</h3></div>
      <div class="toolbar-right">
        ${list.length ? `<button class="btn btn-secondary" onclick="printPaymentsList()">🖨️ طباعة القائمة</button>` : ''}
        <button class="btn btn-primary" onclick="openPaymentForm()">+ سند صرف</button>
      </div>
    </div>
    <div class="card">
      ${list.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>الرقم</th><th>التاريخ</th><th>المستفيد</th><th>المبلغ</th><th>الطريقة</th><th>ملاحظات</th><th>إجراءات</th></tr></thead>
        <tbody>${list.map(p => `
          <tr>
            <td><strong>${esc(p.number)}</strong></td><td>${esc(p.date)}</td>
            <td>${esc(p.beneficiary)}</td><td>${fmt(p.amount)}</td>
            <td>${esc(p.method||'-')}</td><td>${esc(p.notes||'-')}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="printPayment('${p.id}')">🖨️</button>
              <button class="btn btn-danger btn-sm" onclick="softDelete('payments','${p.id}')">🗑️</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">📤</div>لا توجد سندات صرف</div>`}
    </div>
  `;
}

function printPayment(id) {
  const p = state.data.payments.find(x => x.id === id);
  if (!p) return;
  const html = `
    ${printHeaderHtml('سند صرف')}
    <div class="print-meta">
      <div><strong>الرقم:</strong> ${esc(p.number)}</div>
      <div><strong>التاريخ:</strong> ${esc(p.date)}</div>
      <div><strong>المستفيد:</strong> ${esc(p.beneficiary)}</div>
      <div><strong>طريقة الدفع:</strong> ${esc(p.method||'-')}</div>
    </div>
    <div style="margin-top:30px;padding:20px;border:1px solid #ccc;background:#fafafa;">
      <p style="font-size:16px;line-height:2;">
        تم صرف مبلغ وقدره <strong>${fmt(p.amount)}</strong> ${p.method ? `(${esc(p.method)})` : ''}
        إلى السيد/ <strong>${esc(p.beneficiary)}</strong>.
      </p>
      ${p.notes ? `<p><strong>ملاحظات:</strong> ${esc(p.notes)}</p>` : ''}
    </div>
    <div style="margin-top:60px;display:flex;justify-content:space-between;">
      <div>توقيع المستلم: ________________</div>
      <div>توقيع المسؤول: ________________</div>
    </div>
    ${printFooterHtml()}
  `;
  printHtml(html);
}

function printPaymentsList() {
  const list = [...state.data.payments].sort((a,b)=>b.createdAt-a.createdAt);
  if (!list.length) return;
  const total = list.reduce((s,x)=>s+(Number(x.amount)||0),0);
  const html = `
    ${printHeaderHtml('تقرير سندات الصرف')}
    <table>
      <thead><tr><th>#</th><th>الرقم</th><th>التاريخ</th><th>المستفيد</th><th>المبلغ</th><th>الطريقة</th><th>ملاحظات</th></tr></thead>
      <tbody>${list.map((p,i)=>`<tr>
        <td>${i+1}</td><td>${esc(p.number)}</td><td>${esc(p.date)}</td>
        <td>${esc(p.beneficiary)}</td><td>${fmt(p.amount)}</td>
        <td>${esc(p.method||'-')}</td><td>${esc(p.notes||'-')}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr style="background:#f0f0f0;font-weight:bold;">
        <td colspan="4">الإجمالي</td><td>${fmt(total)}</td><td colspan="2"></td>
      </tr></tfoot>
    </table>
    ${printFooterHtml()}
  `;
  printHtml(html);
}

function openPaymentForm() {
  openModal('سند صرف جديد', `
    <div class="form-row">
      <div class="form-group"><label>التاريخ</label><input type="date" id="payDate" value="${today()}"></div>
      <div class="form-group">
        <label>المستفيد * (مورد / شخص)</label>
        <input list="customersListPay" id="payBen" placeholder="اكتب أو اختر..." autocomplete="off">
        <datalist id="customersListPay">
          ${state.data.customers.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}
        </datalist>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>المبلغ *</label><input type="number" id="payAmount" step="0.01" min="0"></div>
      <div class="form-group"><label>طريقة الدفع</label>
        <select id="payMethod"><option>نقدي</option><option>تحويل بنكي</option><option>شيك</option></select>
      </div>
    </div>
    <div class="form-group"><label>ملاحظات</label><textarea id="payNotes" rows="2"></textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="savePayment()">💾 حفظ</button>
    </div>
  `);
}

async function savePayment() {
  const name = readStr('#payBen');
  const amount = readNum('#payAmount');
  const date = readStr('#payDate');
  const method = readStr('#payMethod');
  const notes = readStr('#payNotes');
  if (!name || amount <= 0) { alert('أدخل بيانات صحيحة'); return; }

  let party = state.data.customers.find(c => c.name.trim() === name);
  let partyId = party?.id;
  if (!party) {
    const ref = await userCol('customers').add({
      name, phone: '', address: '', openingBalance: 0, createdAt: Date.now()
    });
    partyId = ref.id;
  }

  const number = await nextNumber('payments', 'PV');
  await userCol('payments').add({
    number, date,
    partyId, beneficiary: name, amount,
    method, notes,
    createdAt: Date.now()
  });
  closeModal();
}

/* ===================== REPORTS ===================== */
function renderReports(c) {
  const from = state.filters.repFrom || '';
  const to = state.filters.repTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);

  const sales = state.data.sales.filter(s => inRange(s.date));
  const purchases = state.data.purchases.filter(p => inRange(p.date));
  const receipts = state.data.receipts.filter(r => inRange(r.date));
  const payments = state.data.payments.filter(p => inRange(p.date));
  const advances = state.data.advances.filter(a => inRange(a.date));
  const salaries = state.data.salaries.filter(s => inRange(s.date));

  const sum = (arr, k) => arr.reduce((s, x) => s + (Number(x[k]) || 0), 0);

  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <label style="font-size:13px;font-weight:600;">من:</label>
        <input type="date" class="search-input" value="${from}" onchange="state.filters.repFrom=this.value;renderSection()">
        <label style="font-size:13px;font-weight:600;">إلى:</label>
        <input type="date" class="search-input" value="${to}" onchange="state.filters.repTo=this.value;renderSection()">
      </div>
      <div class="toolbar-right">
        <button class="btn btn-secondary" onclick="state.filters.repFrom='';state.filters.repTo='';renderSection()">إعادة تعيين</button>
        <button class="btn btn-primary" onclick="printFullReport()">🖨️ طباعة التقرير الكامل</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card green"><div class="stat-label">المبيعات (${sales.length} فاتورة)</div><div class="stat-value small">${fmt(sum(sales,'total'))}</div></div>
      <div class="stat-card orange"><div class="stat-label">المشتريات (${purchases.length} فاتورة)</div><div class="stat-value small">${fmt(sum(purchases,'total'))}</div></div>
      <div class="stat-card purple"><div class="stat-label">سندات القبض (${receipts.length})</div><div class="stat-value small">${fmt(sum(receipts,'amount'))}</div></div>
      <div class="stat-card red"><div class="stat-label">سندات الصرف (${payments.length})</div><div class="stat-value small">${fmt(sum(payments,'amount'))}</div></div>
      <div class="stat-card"><div class="stat-label">السلف (${advances.length})</div><div class="stat-value small">${fmt(sum(advances,'amount'))}</div></div>
      <div class="stat-card"><div class="stat-label">الرواتب (${salaries.length})</div><div class="stat-value small">${fmt(sum(salaries,'net'))}</div></div>
    </div>

    <div class="card">
      <h3>📊 ملخص المبيعات</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>الفاتورة</th><th>التاريخ</th><th>العميل</th><th>النوع</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
        <tbody>${sales.length ? sales.map(s => `
          <tr><td>${esc(s.number)}</td><td>${esc(s.date)}</td><td>${esc(s.customerName)}</td>
          <td>${s.type==='cash'?'نقدي':'آجل'}</td><td>${fmt(s.total)}</td>
          <td>${fmt(s.paid)}</td><td>${fmt(s.remaining)}</td></tr>`).join('') :
          `<tr><td colspan="7" style="text-align:center;color:#94a3b8;">لا توجد بيانات</td></tr>`}</tbody>
      </table></div>
    </div>

    <div class="card">
      <h3>👥 أرصدة العملاء والموردين</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>الاسم</th><th>الهاتف</th><th>الرصيد</th><th>الحالة</th></tr></thead>
        <tbody>${state.data.customers.map(cu => {
          const bal = customerBalance(cu.id);
          const label = bal > 0 ? 'مدين لنا' : bal < 0 ? 'دائن (لنا عنده)' : 'متعادل';
          const cls = bal > 0 ? 'badge-red' : bal < 0 ? 'badge-green' : 'badge-gray';
          return `<tr><td>${esc(cu.name)}</td><td>${esc(cu.phone||'-')}</td>
            <td><span class="badge ${cls}">${fmt(Math.abs(bal))}</span></td>
            <td>${label}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>

    <div class="card">
      <h3>👨‍💼 ملخص الموظفين (${monthNow()})</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>الموظف</th><th>الإجمالي</th><th>السلف</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
        <tbody>${state.data.employees.map(e => {
          const m = employeeMonthData(e.id, monthNow());
          return `<tr><td>${esc(e.name)}</td><td>${fmt(m.total)}</td>
            <td>${fmt(m.advances)}</td><td>${fmt(m.paid)}</td>
            <td><span class="badge ${m.remaining>0?'badge-orange':'badge-green'}">${fmt(m.remaining)}</span></td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>
  `;
}

function printFullReport() {
  const from = state.filters.repFrom || '';
  const to = state.filters.repTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);

  const sales = state.data.sales.filter(s => inRange(s.date));
  const purchases = state.data.purchases.filter(p => inRange(p.date));
  const receipts = state.data.receipts.filter(r => inRange(r.date));
  const payments = state.data.payments.filter(p => inRange(p.date));
  const sum = (arr, k) => arr.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const period = from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : 'كل الفترات';

  const html = `
    ${printHeaderHtml('التقرير الكامل - ' + period)}
    
    <h3 style="margin:20px 0 10px;border-bottom:2px solid #000;padding-bottom:6px;">ملخص عام</h3>
    <table>
      <tr><td><strong>عدد فواتير البيع:</strong></td><td>${sales.length}</td>
          <td><strong>إجمالي المبيعات:</strong></td><td>${fmt(sum(sales,'total'))}</td></tr>
      <tr><td><strong>عدد فواتير الشراء:</strong></td><td>${purchases.length}</td>
          <td><strong>إجمالي المشتريات:</strong></td><td>${fmt(sum(purchases,'total'))}</td></tr>
      <tr><td><strong>سندات القبض:</strong></td><td>${receipts.length}</td>
          <td><strong>إجمالي المقبوضات:</strong></td><td>${fmt(sum(receipts,'amount'))}</td></tr>
      <tr><td><strong>سندات الصرف:</strong></td><td>${payments.length}</td>
          <td><strong>إجمالي المصروفات:</strong></td><td>${fmt(sum(payments,'amount'))}</td></tr>
    </table>

    <h3 style="margin:20px 0 10px;border-bottom:2px solid #000;padding-bottom:6px;">تفاصيل المبيعات</h3>
    <table>
      <thead><tr><th>#</th><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
      <tbody>${sales.length ? sales.map((s,i)=>`<tr>
        <td>${i+1}</td><td>${esc(s.number)}</td><td>${esc(s.date)}</td>
        <td>${esc(s.customerName)}</td><td>${fmt(s.total)}</td>
        <td>${fmt(s.paid)}</td><td>${fmt(s.remaining)}</td></tr>`).join('') :
        '<tr><td colspan="7" style="text-align:center;">لا توجد</td></tr>'}</tbody>
    </table>

    <h3 style="margin:20px 0 10px;border-bottom:2px solid #000;padding-bottom:6px;">أرصدة العملاء والموردين</h3>
    <table>
      <thead><tr><th>#</th><th>الاسم</th><th>الهاتف</th><th>الرصيد</th><th>الحالة</th></tr></thead>
      <tbody>${state.data.customers.map((cu,i) => {
        const bal = customerBalance(cu.id);
        const label = bal > 0 ? 'مدين لنا' : bal < 0 ? 'دائن (لنا عنده)' : 'متعادل';
        return `<tr><td>${i+1}</td><td>${esc(cu.name)}</td><td>${esc(cu.phone||'-')}</td>
          <td>${fmt(Math.abs(bal))}</td><td>${label}</td></tr>`;
      }).join('')}</tbody>
    </table>

    ${printFooterHtml()}
  `;
  printHtml(html);
}

/* ===================== SETTINGS ===================== */
function renderSettings(c) {
  const s = state.settings;
  c.innerHTML = `
    <div class="card">
      <h3>⚙️ إعدادات المؤسسة <small style="color:#64748b;font-weight:400;font-size:13px;">(تظهر في كل المطبوعات)</small></h3>
      
      <div class="form-row">
        <div class="form-group"><label>اسم المؤسسة / المحل *</label>
          <input id="setName" value="${esc(s.businessName||'')}"></div>
        <div class="form-group"><label>العنوان</label>
          <input id="setAddress" value="${esc(s.address||'')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>الهاتف الأول</label>
          <input id="setPhone1" value="${esc(s.phone1||'')}"></div>
        <div class="form-group"><label>الهاتف الثاني</label>
          <input id="setPhone2" value="${esc(s.phone2||'')}"></div>
      </div>
      <div class="form-group"><label>نص التذييل (يظهر أسفل الفواتير)</label>
        <input id="setFooter" value="${esc(s.footer||'')}"></div>

      <div class="form-group">
        <label>الشعار (Logo) — يُرفع مرة واحدة ويظهر في كل المطبوعات</label>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
          <div id="logoPreviewBox" style="width:120px;height:120px;border:2px dashed #cbd5e1;border-radius:12px;display:flex;align-items:center;justify-content:center;background:#f8fafc;overflow:hidden;">
            ${s.logo 
              ? `<img src="${s.logo}" style="width:100%;height:100%;object-fit:contain;">` 
              : `<span style="color:#94a3b8;font-size:12px;text-align:center;">لا يوجد شعار</span>`}
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <input type="file" id="logoFile" accept="image/*" style="display:none;" onchange="handleLogoUpload(event)">
            <button class="btn btn-primary" onclick="document.getElementById('logoFile').click()">📁 رفع شعار</button>
            ${s.logo ? `<button class="btn btn-danger" onclick="removeLogo()">🗑️ حذف الشعار</button>` : ''}
            <small style="color:#64748b;font-size:12px;">يفضّل صورة PNG شفافة، أقل من 500KB</small>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" onclick="resetSettings()">استعادة الافتراضي</button>
        <button class="btn btn-primary" onclick="saveSettings()">💾 حفظ الإعدادات</button>
      </div>
    </div>

    <div class="card">
      <h3>📋 معاينة الطباعة</h3>
      <div style="background:#fff;padding:20px;border:1px solid #e2e8f0;border-radius:12px;max-width:700px;margin:0 auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:16px;margin-bottom:20px;">
          ${s.logo 
            ? `<img src="${s.logo}" style="height:80px;object-fit:contain;">`
            : `<div style="width:80px;height:80px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:32px;font-weight:bold;">${esc((s.businessName||'؟').charAt(0))}</div>`}
          <div style="text-align:left;">
            <h2 style="margin:0 0 6px;">${esc(s.businessName||'اسم المؤسسة')}</h2>
            ${s.address ? `<div style="font-size:13px;color:#64748b;">📍 ${esc(s.address)}</div>` : ''}
            ${(s.phone1||s.phone2) ? `<div style="font-size:13px;color:#64748b;">📞 ${esc([s.phone1,s.phone2].filter(Boolean).join(' / '))}</div>` : ''}
          </div>
        </div>
        <div style="text-align:center;font-size:20px;font-weight:bold;margin:20px 0;">فاتورة بيع</div>
        <div style="font-size:12px;color:#94a3b8;text-align:center;margin-top:30px;">${esc(s.footer||'')}</div>
      </div>
    </div>
  `;
}

async function saveSettings() {
  const data = {
    businessName: readStr('#setName'),
    address: readStr('#setAddress'),
    phone1: readStr('#setPhone1'),
    phone2: readStr('#setPhone2'),
    footer: readStr('#setFooter'),
    logo: state.settings.logo || '',
    updatedAt: Date.now()
  };
  if (!data.businessName) { alert('اسم المؤسسة مطلوب'); return; }
  await userCol('settings').doc('business').set(data, { merge: true });
  state.settings = { ...state.settings, ...data };
  alert('✅ تم حفظ الإعدادات');
  renderSection();
}

async function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 500 * 1024) {
    alert('⚠️ حجم الصورة كبير جدًا (أكبر من 500KB). يرجى اختيار صورة أصغر.');
    return;
  }
  if (!file.type.startsWith('image/')) {
    alert('⚠️ يجب اختيار ملف صورة');
    return;
  }

  const reader = new FileReader();
  reader.onload = async e => {
    const base64 = e.target.result;
    state.settings.logo = base64;
    await userCol('settings').doc('business').set({ logo: base64, updatedAt: Date.now() }, { merge: true });
    alert('✅ تم رفع الشعار بنجاح');
    renderSection();
  };
  reader.readAsDataURL(file);
}

async function removeLogo() {
  if (!confirm('حذف الشعار؟')) return;
  state.settings.logo = '';
  await userCol('settings').doc('business').set({ logo: '', updatedAt: Date.now() }, { merge: true });
  renderSection();
}

async function resetSettings() {
  if (!confirm('استعادة الإعدادات الافتراضية؟ (سيتم الاحتفاظ بالشعار)')) return;
  const defaultSettings = {
    businessName: 'فكرة للديكور والاعلان',
    address: 'القاعدة-شارع المشروع-جوار ملعب التضامن',
    phone1: '777-277-990',
    phone2: '779-504-646',
    footer: 'شكراً لتعاملكم معنا',
    logo: state.settings.logo || '',
    updatedAt: Date.now()
  };
  await userCol('settings').doc('business').set(defaultSettings, { merge: true });
  state.settings = { ...state.settings, ...defaultSettings };
  renderSection();
}

/* ===================== Print Helper ===================== */
function printHtml(contentHtml) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('الرجاء السماح بالنوافذ المنبثقة للطباعة'); return; }
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <title>طباعة</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: 'Cairo', sans-serif; padding: 25px; color: #000;
        direction: rtl; margin: 0;
      }
      .print-header {
        display: flex; align-items: center; justify-content: space-between;
        gap: 20px; padding-bottom: 16px;
        border-bottom: 3px double #000; margin-bottom: 20px;
      }
      .print-logo { height: 90px; width: 90px; object-fit: contain; }
      .print-logo-placeholder {
        width: 90px; height: 90px; background: #1e40af; color: #fff;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%; font-size: 40px; font-weight: bold;
      }
      .print-header-info { flex: 1; text-align: left; }
      .print-header-info h1 { margin: 0 0 6px; font-size: 22px; color: #1e40af; }
      .print-header-info p { margin: 2px 0; font-size: 13px; color: #333; }
      .print-doc-title {
        text-align: center; font-size: 22px; font-weight: bold;
        background: #f0f0f0; padding: 10px; border-radius: 6px;
        margin: 20px 0; border: 1px solid #ccc;
      }
      .print-meta {
        display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px;
        margin: 20px 0; padding: 12px; background: #fafafa;
        border: 1px solid #ddd; border-radius: 6px; font-size: 14px;
      }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
      th, td { border: 1px solid #333; padding: 8px 10px; text-align: right; }
      th { background: #e5e7eb; font-weight: bold; }
      tfoot td { font-weight: bold; }
      .print-totals {
        margin-top: 20px; padding: 16px; background: #fafafa;
        border: 1px solid #ddd; border-radius: 6px;
        display: flex; flex-direction: column; gap: 8px;
      }
      .print-totals > div { display: flex; justify-content: space-between; }
      .print-totals .grand {
        border-top: 2px solid #333; padding-top: 10px; margin-top: 6px;
        font-size: 17px; font-weight: bold;
      }
      .print-notes {
        margin-top: 15px; padding: 12px; background: #fef3c7;
        border-right: 4px solid #f59e0b; border-radius: 4px;
      }
      .print-footer {
        margin-top: 40px; padding-top: 16px; border-top: 1px dashed #999;
        text-align: center; font-size: 12px; color: #666;
      }
      @media print {
        body { padding: 0; }
        .print-doc-title { background: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        th { background: #e5e7eb !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head><body>${contentHtml}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 600);
}