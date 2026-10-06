/* ===================== Utilities ===================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => (Number(n)||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toISOString().slice(0,10);
const monthNow = () => new Date().toISOString().slice(0,7);

/* ===================== State ===================== */
const state = {
  user: null,
  data: {
    customers:[], employees:[], items:[], sales:[], purchases:[],
    receipts:[], payments:[], advances:[], salaries:[]
  },
  unsubs: [],
  section: 'dashboard',
  filters: {}
};

const COLLECTIONS = ['customers','employees','items','sales','purchases','receipts','payments','advances','salaries'];

/* ===================== Auth ===================== */
$('#googleLogin').addEventListener('click', async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
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
    customers:'العملاء', items:'الأصناف والمخزون', employees:'الموظفون',
    advances:'سلف الموظفين', salaries:'الرواتب', receipts:'سندات القبض',
    payments:'سندات الصرف', reports:'التقارير'
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
    payments: renderPayments, reports: renderReports
  };
  (map[state.section] || renderDashboard)(c);
}

/* ===================== Business Logic ===================== */
function customerBalance(id) {
  const c = state.data.customers.find(x => x.id === id);
  if (!c) return 0;
  const opening = Number(c.openingBalance) || 0;
  const salesRem = state.data.sales.filter(s => s.customerId === id)
    .reduce((s, x) => s + (Number(x.remaining) || 0), 0);
  const receipts = state.data.receipts.filter(r => r.customerId === id)
    .reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return opening + salesRem - receipts;
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

/* ===================== DASHBOARD ===================== */
function renderDashboard(c) {
  const sales = state.data.sales;
  const purchases = state.data.purchases;
  const totalSales = sales.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const totalPurchases = purchases.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const totalDebts = state.data.customers.reduce((s, cu) => s + Math.max(0, customerBalance(cu.id)), 0);
  const totalCash = sales.reduce((s, x) => s + (Number(x.paid) || 0), 0);
  const lowStock = state.data.items.filter(i => Number(i.quantity) <= Number(i.minQuantity || 0)).length;

  c.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card green"><div class="stat-label">إجمالي المبيعات</div><div class="stat-value">${fmt(totalSales)}</div></div>
      <div class="stat-card orange"><div class="stat-label">إجمالي المشتريات</div><div class="stat-value">${fmt(totalPurchases)}</div></div>
      <div class="stat-card red"><div class="stat-label">ديون العملاء</div><div class="stat-value">${fmt(totalDebts)}</div></div>
      <div class="stat-card purple"><div class="stat-label">النقد المُحصّل</div><div class="stat-value">${fmt(totalCash)}</div></div>
      <div class="stat-card"><div class="stat-label">عدد العملاء</div><div class="stat-value">${state.data.customers.length}</div></div>
      <div class="stat-card"><div class="stat-label">عدد الأصناف</div><div class="stat-value">${state.data.items.length}</div></div>
      <div class="stat-card"><div class="stat-label">عدد الموظفين</div><div class="stat-value">${state.data.employees.length}</div></div>
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
  if (!state.data.customers.length) { alert('أضف عميلاً أولاً'); return; }
  tempSaleItems = [];
  const customers = state.data.customers;
  const items = state.data.items;

  openModal('فاتورة بيع جديدة', `
    <div class="form-row">
      <div class="form-group"><label>التاريخ</label><input type="date" id="saleDate" value="${today()}"></div>
      <div class="form-group"><label>نوع الفاتورة</label>
        <select id="saleType"><option value="cash">نقدي</option><option value="credit">آجل</option></select>
      </div>
    </div>
    <div class="form-group"><label>العميل</label>
      <select id="saleCustomer">${customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>الأصناف</label>
      <div id="saleItemsContainer"></div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="addSaleItemRow()">+ إضافة صنف</button>
    </div>
    <div class="form-row-3">
      <div class="form-group"><label>الخصم</label><input type="number" id="saleDiscount" value="0" min="0" step="0.01" oninput="recalcSale()"></div>
      <div class="form-group"><label>الضريبة</label><input type="number" id="saleTax" value="0" min="0" step="0.01" oninput="recalcSale()"></div>
      <div class="form-group"><label>المدفوع</label><input type="number" id="salePaid" value="0" min="0" step="0.01" oninput="recalcSale()"></div>
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
  addSaleItemRow();
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
  const disc = Number($('#saleDiscount')?.value)||0;
  const tax = Number($('#saleTax')?.value)||0;
  const paid = Number($('#salePaid')?.value)||0;
  const total = sub - disc + tax;
  const rem = total - paid;
  if ($('#saleSubtotal')) $('#saleSubtotal').textContent = fmt(sub);
  if ($('#saleDiscDisp')) $('#saleDiscDisp').textContent = fmt(disc);
  if ($('#saleTaxDisp')) $('#saleTaxDisp').textContent = fmt(tax);
  if ($('#saleTotal')) $('#saleTotal').textContent = fmt(total);
  if ($('#saleRemaining')) $('#saleRemaining').textContent = fmt(rem);
}

async function saveSale() {
  const validItems = tempSaleItems.filter(i => i.itemId && i.qty > 0);
  if (!validItems.length) { alert('أضف صنفاً واحداً على الأقل'); return; }
  const customerId = $('#saleCustomer').value;
  const customer = state.data.customers.find(c => c.id === customerId);
  const sub = validItems.reduce((s,i)=>s+i.total,0);
  const disc = Number($('#saleDiscount').value)||0;
  const tax = Number($('#saleTax').value)||0;
  const total = sub - disc + tax;
  const paid = Number($('#salePaid').value)||0;
  const type = $('#saleType').value;

  const number = await nextNumber('sales', 'S');
  const sale = {
    number, date: $('#saleDate').value, type, customerId, customerName: customer?.name || '',
    items: validItems, subtotal: sub, discount: disc, tax, total, paid,
    remaining: total - paid, notes: $('#saleNotes').value || '',
    createdAt: Date.now()
  };
  await userCol('sales').add(sale);

  // Update inventory
  const batch = db.batch();
  validItems.forEach(it => {
    const ref = userCol('items').doc(it.itemId);
    batch.update(ref, { quantity: firebase.firestore.FieldValue.increment(-it.qty) });
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
    <div class="invoice-print">
      <h2>فاتورة بيع - ${esc(s.number)}</h2>
      <div class="invoice-header">
        <div><strong>التاريخ:</strong> ${esc(s.date)}</div>
        <div><strong>النوع:</strong> ${s.type==='cash'?'نقدي':'آجل'}</div>
      </div>
      <div><strong>العميل:</strong> ${esc(s.customerName)}</div>
      <table>
        <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>${(s.items||[]).map(it=>`<tr><td>${esc(it.name)}</td><td>${it.qty}</td><td>${fmt(it.price)}</td><td>${fmt(it.total)}</td></tr>`).join('')}</tbody>
      </table>
      <div style="text-align:left;margin-top:20px;">
        <div>المجموع الفرعي: ${fmt(s.subtotal)}</div>
        <div>الخصم: ${fmt(s.discount)}</div>
        <div>الضريبة: ${fmt(s.tax)}</div>
        <div style="font-size:18px;font-weight:bold;margin-top:8px;">الإجمالي: ${fmt(s.total)}</div>
        <div>المدفوع: ${fmt(s.paid)}</div>
        <div>المتبقي: ${fmt(s.remaining)}</div>
      </div>
      <div style="margin-top:30px;">ملاحظات: ${esc(s.notes||'-')}</div>
    </div>
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
            <td><button class="btn btn-danger btn-sm" onclick="deletePurchase('${p.id}')">🗑️</button></td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">📥</div>لا توجد فواتير شراء</div>`}
    </div>
  `;
}

let tempPurchaseItems = [];

function openPurchaseForm() {
  if (!state.data.items.length) { alert('أضف أصنافاً أولاً'); return; }
  tempPurchaseItems = [];
  openModal('فاتورة شراء جديدة', `
    <div class="form-row">
      <div class="form-group"><label>التاريخ</label><input type="date" id="pDate" value="${today()}"></div>
      <div class="form-group"><label>المورد</label><input type="text" id="pSupplier" placeholder="اسم المورد"></div>
    </div>
    <div class="form-group"><label>الأصناف</label>
      <div id="pItemsContainer"></div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="addPurchaseItemRow()">+ إضافة صنف</button>
    </div>
    <div class="form-row-3">
      <div class="form-group"><label>الخصم</label><input type="number" id="pDiscount" value="0" oninput="recalcPurchase()"></div>
      <div class="form-group"><label>الضريبة</label><input type="number" id="pTax" value="0" oninput="recalcPurchase()"></div>
      <div class="form-group"><label>المدفوع</label><input type="number" id="pPaid" value="0" oninput="recalcPurchase()"></div>
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
  tempPurchaseItems.push({ itemId:'', name:'', qty:1, price:0, total:0 });
  renderPurchaseItemRows();
}

function renderPurchaseItemRows() {
  const cont = $('#pItemsContainer');
  if (!cont) return;
  const items = state.data.items;
  cont.innerHTML = tempPurchaseItems.map((it, i) => `
    <div class="item-row">
      <select onchange="updatePurchaseItem(${i},'itemId',this.value)">
        <option value="">-- اختر صنف --</option>
        ${items.map(x=>`<option value="${x.id}" ${it.itemId===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}
      </select>
      <input type="number" min="1" value="${it.qty}" onchange="updatePurchaseItem(${i},'qty',this.value)">
      <input type="number" min="0" step="0.01" value="${it.price}" onchange="updatePurchaseItem(${i},'price',this.value)">
      <span class="row-total">${fmt(it.total)}</span>
      <button class="row-remove" onclick="removePurchaseItem(${i})">×</button>
    </div>
  `).join('');
  recalcPurchase();
}

function updatePurchaseItem(i, field, val) {
  const it = tempPurchaseItems[i];
  if (!it) return;
  if (field === 'itemId') {
    const item = state.data.items.find(x => x.id === val);
    it.itemId = val; it.name = item?.name || '';
    if (item && !it.price) it.price = Number(item.cost) || 0;
  } else if (field === 'qty') it.qty = Math.max(0, Number(val) || 0);
  else if (field === 'price') it.price = Math.max(0, Number(val) || 0);
  it.total = it.qty * it.price;
  renderPurchaseItemRows();
}
function removePurchaseItem(i) { tempPurchaseItems.splice(i,1); renderPurchaseItemRows(); }

function recalcPurchase() {
  const sub = tempPurchaseItems.reduce((s,i)=>s+i.total,0);
  const disc = Number($('#pDiscount')?.value)||0;
  const tax = Number($('#pTax')?.value)||0;
  const paid = Number($('#pPaid')?.value)||0;
  const total = sub - disc + tax;
  if ($('#pSubtotal')) $('#pSubtotal').textContent = fmt(sub);
  if ($('#pTotal')) $('#pTotal').textContent = fmt(total);
  if ($('#pRemaining')) $('#pRemaining').textContent = fmt(total - paid);
}

async function savePurchase() {
  const validItems = tempPurchaseItems.filter(i => i.itemId && i.qty > 0);
  if (!validItems.length) { alert('أضف صنفاً واحداً على الأقل'); return; }
  const sub = validItems.reduce((s,i)=>s+i.total,0);
  const disc = Number($('#pDiscount').value)||0;
  const tax = Number($('#pTax').value)||0;
  const total = sub - disc + tax;
  const paid = Number($('#pPaid').value)||0;

  const number = await nextNumber('purchases', 'P');
  await userCol('purchases').add({
    number, date: $('#pDate').value, supplierName: $('#pSupplier').value || '',
    items: validItems, subtotal: sub, discount: disc, tax, total, paid,
    remaining: total - paid, notes: $('#pNotes').value || '', createdAt: Date.now()
  });

  const batch = db.batch();
  validItems.forEach(it => {
    batch.update(userCol('items').doc(it.itemId), {
      quantity: firebase.firestore.FieldValue.increment(it.qty),
      cost: it.price
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

/* ===================== CUSTOMERS ===================== */
function renderCustomers(c) {
  const q = (state.filters.customers || '').toLowerCase();
  const list = state.data.customers.filter(x => !q || (x.name||'').toLowerCase().includes(q) || (x.phone||'').includes(q));

  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" placeholder="🔍 بحث بالاسم أو الهاتف..." value="${esc(state.filters.customers||'')}" oninput="setFilter('customers',this.value)">
      </div>
      <div class="toolbar-right">
        <button class="btn btn-primary" onclick="openCustomerForm()">+ عميل جديد</button>
      </div>
    </div>
    <div class="card">
      ${list.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>الاسم</th><th>الهاتف</th><th>العنوان</th><th>رصيد افتتاحي</th><th>الرصيد الحالي</th><th>إجراءات</th></tr></thead>
        <tbody>${list.map(cu => {
          const bal = customerBalance(cu.id);
          return `<tr>
            <td><strong>${esc(cu.name)}</strong></td>
            <td>${esc(cu.phone||'-')}</td>
            <td>${esc(cu.address||'-')}</td>
            <td>${fmt(cu.openingBalance)}</td>
            <td><span class="badge ${bal>0?'badge-red':bal<0?'badge-green':'badge-gray'}">${fmt(bal)}</span></td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="openCustomerForm('${cu.id}')">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="softDelete('customers','${cu.id}')">🗑️</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">👥</div>لا يوجد عملاء</div>`}
    </div>
  `;
}

function openCustomerForm(id) {
  const cu = id ? state.data.customers.find(x => x.id === id) : null;
  openModal(cu ? 'تعديل عميل' : 'عميل جديد', `
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
  const name = $('#cuName').value.trim();
  if (!name) { alert('الاسم مطلوب'); return; }
  const data = {
    name, phone: $('#cuPhone').value, address: $('#cuAddress').value,
    openingBalance: Number($('#cuOpening').value) || 0,
    notes: $('#cuNotes').value, updatedAt: Date.now()
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
        <button class="btn btn-primary" onclick="openItemForm()">+ صنف جديد</button>
      </div>
    </div>
    <div class="card">
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
  const name = $('#itName').value.trim();
  if (!name) { alert('الاسم مطلوب'); return; }
  const data = {
    code: $('#itCode').value, name, unit: $('#itUnit').value,
    cost: Number($('#itCost').value) || 0,
    price: Number($('#itPrice').value) || 0,
    minQuantity: Number($('#itMin').value) || 0,
    notes: $('#itNotes').value, updatedAt: Date.now()
  };
  if (id) {
    await userCol('items').doc(id).update(data);
  } else {
    data.quantity = Number($('#itQty').value) || 0;
    data.createdAt = Date.now();
    await userCol('items').add(data);
  }
  closeModal();
}

/* ===================== EMPLOYEES ===================== */
function renderEmployees(c) {
  const q = (state.filters.employees || '').toLowerCase();
  const list = state.data.employees.filter(x => !q || (x.name||'').toLowerCase().includes(q));
  const month = monthNow();

  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" placeholder="🔍 بحث بالاسم..." value="${esc(state.filters.employees||'')}" oninput="setFilter('employees',this.value)">
      </div>
      <div class="toolbar-right">
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
  const name = $('#emName').value.trim();
  if (!name) { alert('الاسم مطلوب'); return; }
  const data = {
    name, position: $('#emPos').value, phone: $('#emPhone').value,
    hireDate: $('#emHire').value,
    basicSalary: Number($('#emBasic').value) || 0,
    allowances: Number($('#emAllow').value) || 0,
    notes: $('#emNotes').value, updatedAt: Date.now()
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
            <td><button class="btn btn-danger btn-sm" onclick="softDelete('advances','${a.id}')">🗑️</button></td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">💵</div>لا توجد سلف</div>`}
    </div>
  `;
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
  const empId = $('#advEmp').value;
  const emp = state.data.employees.find(e => e.id === empId);
  const amount = Number($('#advAmount').value) || 0;
  if (amount <= 0) { alert('أدخل مبلغاً صحيحاً'); return; }
  const number = await nextNumber('advances', 'ADV');
  await userCol('advances').add({
    number, date: $('#advDate').value, employeeId: empId, employeeName: emp?.name || '',
    amount, notes: $('#advNotes').value || '', createdAt: Date.now()
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
  const amount = Number($('#salAmount').value) || 0;
  if (amount <= 0) { alert('أدخل مبلغاً صحيحاً'); return; }
  const number = await nextNumber('salaries', 'SAL');
  await userCol('salaries').add({
    number, date: $('#salDate').value, month: $('#salMonth').value,
    employeeId: empId, employeeName: emp?.name || '',
    net: amount, notes: $('#salNotes').value || '', createdAt: Date.now()
  });
  closeModal();
}

/* ===================== RECEIPTS ===================== */
function renderReceipts(c) {
  const list = [...state.data.receipts].sort((a,b)=>b.createdAt-a.createdAt);
  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left"><h3>سندات القبض</h3></div>
      <div class="toolbar-right"><button class="btn btn-primary" onclick="openReceiptForm()">+ سند قبض</button></div>
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
            <td><button class="btn btn-danger btn-sm" onclick="softDelete('receipts','${r.id}')">🗑️</button></td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">📨</div>لا توجد سندات</div>`}
    </div>
  `;
}

function openReceiptForm() {
  if (!state.data.customers.length) { alert('أضف عميلاً أولاً'); return; }
  openModal('سند قبض جديد', `
    <div class="form-row">
      <div class="form-group"><label>التاريخ</label><input type="date" id="rDate" value="${today()}"></div>
      <div class="form-group"><label>العميل</label>
        <select id="rCust">${state.data.customers.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
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
  const custId = $('#rCust').value;
  const cust = state.data.customers.find(c => c.id === custId);
  const amount = Number($('#rAmount').value) || 0;
  if (amount <= 0) { alert('أدخل مبلغاً صحيحاً'); return; }
  const number = await nextNumber('receipts', 'RC');
  await userCol('receipts').add({
    number, date: $('#rDate').value, customerId: custId, customerName: cust?.name || '',
    amount, method: $('#rMethod').value, notes: $('#rNotes').value || '', createdAt: Date.now()
  });
  closeModal();
}

/* ===================== PAYMENTS ===================== */
function renderPayments(c) {
  const list = [...state.data.payments].sort((a,b)=>b.createdAt-a.createdAt);
  c.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-left"><h3>سندات الصرف</h3></div>
      <div class="toolbar-right"><button class="btn btn-primary" onclick="openPaymentForm()">+ سند صرف</button></div>
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
            <td><button class="btn btn-danger btn-sm" onclick="softDelete('payments','${p.id}')">🗑️</button></td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">📤</div>لا توجد سندات صرف</div>`}
    </div>
  `;
}

function openPaymentForm() {
  openModal('سند صرف جديد', `
    <div class="form-row">
      <div class="form-group"><label>التاريخ</label><input type="date" id="payDate" value="${today()}"></div>
      <div class="form-group"><label>المستفيد *</label><input id="payBen" placeholder="اسم المستفيد"></div>
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
  const ben = $('#payBen').value.trim();
  const amount = Number($('#payAmount').value) || 0;
  if (!ben || amount <= 0) { alert('أدخل بيانات صحيحة'); return; }
  const number = await nextNumber('payments', 'PV');
  await userCol('payments').add({
    number, date: $('#payDate').value, beneficiary: ben, amount,
    method: $('#payMethod').value, notes: $('#payNotes').value || '', createdAt: Date.now()
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
        <button class="btn btn-primary" onclick="window.print()">🖨️ طباعة</button>
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
      <h3>👥 أرصدة العملاء</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>العميل</th><th>الهاتف</th><th>الرصيد</th></tr></thead>
        <tbody>${state.data.customers.map(cu => {
          const bal = customerBalance(cu.id);
          return `<tr><td>${esc(cu.name)}</td><td>${esc(cu.phone||'-')}</td>
            <td><span class="badge ${bal>0?'badge-red':'badge-green'}">${fmt(bal)}</span></td></tr>`;
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

/* ===================== Print Helper ===================== */
function printHtml(html) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('الرجاء السماح بالنوافذ المنبثقة'); return; }
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <title>طباعة</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
      body{font-family:'Cairo',sans-serif;padding:20px;color:#000;}
      h2{text-align:center;margin-bottom:20px;}
      .invoice-header{display:flex;justify-content:space-between;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #000;}
      table{width:100%;border-collapse:collapse;margin:16px 0;}
      th,td{border:1px solid #000;padding:8px;text-align:right;}
      th{background:#f0f0f0;}
      @media print{ body{padding:0;} }
    </style>
  </head><body>${html}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
}