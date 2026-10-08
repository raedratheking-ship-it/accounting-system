/* =====================================================================
   النظام المحاسبي المتكامل - app.js
   VERSION 13 - Excel + عروض الأسعار
   ===================================================================== */

console.log('✅ app.js VERSION 13 loaded — ' + new Date().toISOString());

/* ====== معالج تسجيل الدخول ====== */
(function setupLogin() {
  const btn = document.getElementById('googleLogin');
  if (!btn) { console.error('❌ لم يتم العثور على زر #googleLogin'); return; }
  console.log('✅ زر تسجيل الدخول مرتبط');

  btn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (typeof firebase === 'undefined') { alert('❌ Firebase SDK لم يُحمّل'); return; }
    if (typeof auth === 'undefined') { alert('❌ Firebase Auth غير مهيأ'); return; }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await auth.signInWithPopup(provider);
      console.log('✅ نجح تسجيل الدخول:', result.user.email);
    } catch (e) {
      if (['auth/popup-blocked','auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(e.code)) {
        try { await auth.signInWithRedirect(provider); }
        catch (e2) { const errEl = document.getElementById('loginError'); if (errEl) errEl.textContent = 'فشل: ' + e2.message; }
      } else {
        const errEl = document.getElementById('loginError'); if (errEl) errEl.textContent = 'فشل: ' + e.message;
      }
    }
  }, true);
})();

/* ===================== Utilities ===================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = n => (Number(n)||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toISOString().slice(0,10);
const monthNow = () => new Date().toISOString().slice(0,7);

function toLatinDigits(str) {
  return String(str || '')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[،,]/g, '.');
}
function parseNum(str, fallback = 0) {
  const n = parseFloat(toLatinDigits(str));
  return isNaN(n) ? fallback : n;
}
const readNum = (sel, fallback = 0) => {
  const el = document.querySelector(sel);
  if (!el) return fallback;
  return parseNum(el.value, fallback);
};
const readStr = (sel, fallback = '') => {
  const el = document.querySelector(sel);
  return el ? (el.value || '').trim() : fallback;
};

/* ============================================================
   🎨 استخراج الألوان من الشعار
   ============================================================ */
function rgbToHex({ r, g, b }) {
  const toHex = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}
function adjustColor({ r, g, b }, amount) {
  if (amount > 0) {
    return {
      r: r + (255 - r) * amount / 100,
      g: g + (255 - g) * amount / 100,
      b: b + (255 - b) * amount / 100
    };
  } else {
    const f = 1 + amount / 100;
    return { r: r * f, g: g * f, b: b * f };
  }
}

async function extractColorsFromLogo(base64) {
  return new Promise(resolve => {
    const defaultColors = {
      primary: { r: 26, g: 59, b: 92 },
      secondary: { r: 74, g: 158, b: 255 }
    };
    if (!base64) return resolve(defaultColors);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 120;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 120, 120);
        const data = ctx.getImageData(0, 0, 120, 120).data;

        const buckets = {};
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 200) continue;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const lum = (max + min) / 2;
          if (lum > 235 || lum < 25) continue;
          const sat = max === 0 ? 0 : (max - min) / max;
          if (sat < 0.15 && lum > 180) continue;
          const k = `${Math.floor(r / 32)}_${Math.floor(g / 32)}_${Math.floor(b / 32)}`;
          if (!buckets[k]) buckets[k] = { r: 0, g: 0, b: 0, count: 0 };
          buckets[k].r += r; buckets[k].g += g; buckets[k].b += b; buckets[k].count++;
        }

        const sorted = Object.values(buckets)
          .map(b => ({ r: Math.round(b.r / b.count), g: Math.round(b.g / b.count), b: Math.round(b.b / b.count), count: b.count }))
          .sort((a, b) => b.count - a.count);

        if (sorted.length === 0) return resolve(defaultColors);
        const primary = sorted[0];
        let secondary = null;
        for (let i = 1; i < sorted.length; i++) {
          const c = sorted[i];
          const diff = Math.abs(c.r - primary.r) + Math.abs(c.g - primary.g) + Math.abs(c.b - primary.b);
          if (diff > 120) { secondary = c; break; }
        }
        if (!secondary) secondary = adjustColor(primary, 40);
        resolve({ primary, secondary });
      } catch (e) {
        console.warn('⚠️ خطأ استخراج الألوان:', e);
        resolve(defaultColors);
      }
    };
    img.onerror = () => resolve(defaultColors);
    img.src = base64;
  });
}

function applyThemeColors(primary, secondary) {
  const root = document.documentElement;
  const p = primary, s = secondary;

  root.style.setProperty('--primary', rgbToHex(p));
  root.style.setProperty('--primary-dark', rgbToHex(adjustColor(p, -25)));
  root.style.setProperty('--primary-light', rgbToHex(adjustColor(p, 20)));
  root.style.setProperty('--primary-soft', rgbToHex(adjustColor(p, 82)));
  root.style.setProperty('--primary-pale', rgbToHex(adjustColor(p, 94)));

  root.style.setProperty('--accent', rgbToHex(s));
  root.style.setProperty('--accent-light', rgbToHex(adjustColor(s, 25)));

  console.log('🎨 تم تطبيق الألوان:', { primary: rgbToHex(p), secondary: rgbToHex(s) });
}

function applyDefaultTheme() {
  applyThemeColors(
    { r: 26, g: 59, b: 92 },
    { r: 74, g: 158, b: 255 }
  );
}

/* ===================== State ===================== */
const state = {
  user: null,
  data: {
    customers:[], employees:[], items:[], sales:[], purchases:[],
    receipts:[], payments:[], advances:[], salaries:[], journal:[], quotations:[]
  },
  settings: {
    businessName: '',
    address: '',
    phones: [],
    logo: '', footer: '',
    themePrimary: null, themeSecondary: null
  },
  unsubs: [],
  section: 'dashboard',
  filters: {}
};

const COLLECTIONS = ['customers','employees','items','sales','purchases','receipts','payments','advances','salaries','journal','quotations'];

/* ===================== Auth State ===================== */
$('#logoutBtn').addEventListener('click', async () => {
  if (confirm('هل تريد تسجيل الخروج؟')) await auth.signOut();
});

auth.onAuthStateChanged(user => {
  if (user) {
    state.user = user;
    $('#loginScreen').classList.add('hidden');
    $('#app').classList.remove('hidden');

    const userName = user.displayName || user.email;
    const userPhotoSrc = user.photoURL || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23cbd5e1"%3E%3Cpath d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/%3E%3C/svg%3E';

    $('#userName').textContent = userName;
    $('#userNameSidebar').textContent = userName;
    $('#userPhoto').src = userPhotoSrc;
    $('#userPhotoTop').src = userPhotoSrc;

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
        state.data[col] = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.deleted);
        renderSection();
      },
      err => console.error(`Error loading ${col}:`, err)
    );
    state.unsubs.push(unsub);
  });

  const settingsUnsub = userCol('settings').doc('business').onSnapshot(snap => {
    if (snap.exists) {
      state.settings = { ...state.settings, ...snap.data() };
      if (state.settings.themePrimary && state.settings.themeSecondary) {
        applyThemeColors(state.settings.themePrimary, state.settings.themeSecondary);
      } else {
        applyDefaultTheme();
      }
    } else {
      applyDefaultTheme();
    }
    const bn = document.getElementById('brandName');
    if (bn) bn.textContent = state.settings.businessName || 'المحاسبة';
    renderSection();
  }, err => {
    console.warn('Settings load error:', err);
    applyDefaultTheme();
  });
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
  renderSection();
  $('#sidebar').classList.remove('open');
}

function renderSection() {
  const c = $('#content');
  const map = {
    dashboard: renderDashboard, journal: renderJournal, quotations: renderQuotations,
    sales: renderSales, purchases: renderPurchases, customers: renderCustomers,
    items: renderItems, employees: renderEmployees, advances: renderAdvances,
    salaries: renderSalaries, receipts: renderReceipts, payments: renderPayments,
    reports: renderReports, settings: renderSettings
  };
  (map[state.section] || renderDashboard)(c);
}

/* ===================== Business Logic ===================== */
function customerBalance(id) {
  const c = state.data.customers.find(x => x.id === id);
  if (!c) return 0;
  const opening = Number(c.openingBalance) || 0;
  const salesRemaining = state.data.sales.filter(s => s.customerId === id).reduce((s, x) => s + (Number(x.remaining) || 0), 0);
  const receipts = state.data.receipts.filter(r => r.customerId === id).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const purchasesRemaining = state.data.purchases.filter(p => p.supplierId === id).reduce((s, x) => s + (Number(x.remaining) || 0), 0);
  const payments = state.data.payments.filter(p => p.partyId === id).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const journalPayments = state.data.journal.filter(j => j.type === 'customer' && j.partyId === id).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return opening + salesRemaining - receipts - purchasesRemaining + payments - journalPayments;
}

function employeeMonthData(empId, month) {
  const emp = state.data.employees.find(e => e.id === empId);
  if (!emp) return { total:0, advances:0, paid:0, remaining:0 };
  const total = (Number(emp.basicSalary) || 0) + (Number(emp.allowances) || 0);
  const advances = state.data.advances.filter(a => a.employeeId === empId && (a.date || '').startsWith(month)).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const paid = state.data.salaries.filter(s => s.employeeId === empId && s.month === month).reduce((s, x) => s + (Number(x.net) || 0), 0);
  return { total, advances, paid, remaining: total - advances - paid };
}

/* ===================== Modal ===================== */
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

/* ===================== Print Header ===================== */
function printHeaderHtml(docTitle) {
  const s = state.settings;
  const phonesList = Array.isArray(s.phones) ? s.phones : [];
  const phones = phonesList.filter(Boolean).join(' / ');
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

/* ===================== PDF Export ===================== */
function exportPDF(docTitle, contentHTML, filename) {
  if (typeof html2pdf === 'undefined') {
    alert('⚠️ مكتبة PDF لم تُحمّل');
    return;
  }
  const s = state.settings;
  const primary = s.themePrimary ? rgbToHex(s.themePrimary) : '#1a3b5c';
  const secondary = s.themeSecondary ? rgbToHex(s.themeSecondary) : '#4a9eff';
  const primaryPale = s.themePrimary ? rgbToHex(adjustColor(s.themePrimary, 94)) : '#eff6ff';
  const secondarySoft = s.themeSecondary ? rgbToHex(adjustColor(s.themeSecondary, 88)) : '#e0f2fe';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'direction:rtl;font-family:Cairo,sans-serif;padding:15px;background:#fff;color:#000;width:100%;';
  wrapper.innerHTML = `
    <style>
      .print-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:12px;border-bottom:3px double ${primary};margin-bottom:14px;}
      .print-logo{height:75px;width:75px;object-fit:contain;}
      .print-logo-placeholder{width:75px;height:75px;background:${primary};color:#fff;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:34px;font-weight:bold;}
      .print-header-info{flex:1;text-align:left;}
      .print-header-info h1{margin:0 0 4px;font-size:18px;color:${primary};}
      .print-header-info p{margin:2px 0;font-size:11px;color:#333;}
      .print-doc-title{text-align:center;font-size:17px;font-weight:bold;background:${primaryPale};color:${primary};padding:8px;border-radius:5px;margin:14px 0;border:1px solid ${secondarySoft};}
      table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px;}
      th,td{border:1px solid #cbd5e1;padding:5px 7px;text-align:right;}
      th{background:${primaryPale};color:${primary};font-weight:bold;border-bottom:2px solid ${secondarySoft};}
      .print-totals{margin-top:12px;padding:10px;background:#fafafa;border:1px solid #cbd5e1;border-radius:5px;}
      .print-totals > div{display:flex;justify-content:space-between;margin:3px 0;font-size:11px;}
      .print-totals .grand{border-top:2px solid ${primary};padding-top:6px;margin-top:5px;font-size:13px;font-weight:bold;color:${primary};}
      .print-meta{display:grid;grid-template-columns:1fr 1fr;gap:5px 15px;margin:12px 0;padding:8px;background:#fafafa;border:1px solid #cbd5e1;border-radius:5px;font-size:11px;}
      .print-footer{margin-top:20px;padding-top:10px;border-top:1px dashed #999;text-align:center;font-size:10px;color:#666;}
      .print-notes{margin-top:10px;padding:8px;background:#fef3c7;border-right:3px solid #f59e0b;border-radius:3px;font-size:11px;}
      .voucher-box{margin-top:15px;padding:12px;border:1px solid #cbd5e1;background:#fafafa;font-size:12px;line-height:1.9;}
      .signatures{margin-top:35px;display:flex;justify-content:space-between;font-size:11px;}
    </style>
    ${printHeaderHtml(docTitle)}
    ${contentHTML}
    ${printFooterHtml()}
  `;
  const opt = {
    margin: [8, 8, 8, 8],
    filename: (filename || docTitle.replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, '_')) + '.pdf',
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: 0 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };
  html2pdf().set(opt).from(wrapper).save()
    .then(() => console.log('✅ تم تصدير PDF:', docTitle))
    .catch(err => { console.error('❌ خطأ PDF:', err); alert('فشل PDF: ' + err.message); });
}

/* ============================================================
   📊 EXCEL - تصدير واستيراد
   ============================================================ */function exportToExcel(data, headers, filename, sheetName = 'Sheet1') {
  if (typeof XLSX === 'undefined') {
    alert('⚠️ مكتبة Excel لم تُحمّل. تحقق من الإنترنت وأعد تحميل الصفحة.');
    return;
  }
  try {
    const aoa = [headers.map(h => h.label)];
    data.forEach(row => {
      aoa.push(headers.map(h => {
        const val = h.getter ? h.getter(row) : row[h.key];
        return val === undefined || val === null ? '' : val;
      }));
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = headers.map(h => ({ wch: h.width || 18 }));

    // ضبط النص على RTL لكل خلية (لضمان عرض عربي صحيح)
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        ws[addr].s = {
          alignment: {
            readingOrder: 2,
            horizontal: 'right',
            vertical: 'center'
          }
        };
      }
    }

    const wb = XLSX.utils.book_new();

    // ✅ الحل الأساسي: ضبط RTL على مستوى الـ Workbook
    wb.Workbook = {
      Views: [{ RTL: true }]
    };

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename + '_' + today() + '.xlsx');
    console.log('✅ تم تصدير Excel:', filename);
  } catch (err) {
    console.error('❌ Excel export error:', err);
    alert('فشل تصدير Excel: ' + err.message);
  }
}

function importFromExcel(callback) {
  if (typeof XLSX === 'undefined') {
    alert('⚠️ مكتبة Excel لم تُحمّل');
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
        console.log('✅ تم قراءة Excel:', json.length, 'صف');
        callback(json);
      } catch (err) {
        console.error('❌ Excel import error:', err);
        alert('فشل قراءة الملف: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}
function downloadTemplate(headers, filename, sampleRow = null) {
  if (typeof XLSX === 'undefined') { alert('⚠️ مكتبة Excel لم تُحمّل'); return; }
  const aoa = [headers];
  if (sampleRow) aoa.push(sampleRow);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = headers.map(() => ({ wch: 20 }));

  // ضبط RTL لكل خلية
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      ws[addr].s = {
        alignment: { readingOrder: 2, horizontal: 'right', vertical: 'center' }
      };
    }
  }

  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, filename + '.xlsx');
}

/* ============ التصدير لأقسام ============ */

function exportCustomersExcel() {
  exportToExcel(state.data.customers, [
    { label: 'الاسم', key: 'name', width: 25 },
    { label: 'الهاتف', key: 'phone', width: 15 },
    { label: 'العنوان', key: 'address', width: 30 },
    { label: 'الرصيد الافتتاحي', key: 'openingBalance', width: 15 },
    { label: 'الرصيد الحالي', getter: cu => customerBalance(cu.id), width: 15 },
    { label: 'ملاحظات', key: 'notes', width: 30 }
  ], 'العملاء', 'العملاء');
}

function exportItemsExcel() {
  exportToExcel(state.data.items, [
    { label: 'الكود', key: 'code', width: 12 },
    { label: 'الاسم', key: 'name', width: 30 },
    { label: 'الوحدة', key: 'unit', width: 10 },
    { label: 'سعر التكلفة', key: 'cost', width: 12 },
    { label: 'سعر البيع', key: 'price', width: 12 },
    { label: 'الكمية', key: 'quantity', width: 10 },
    { label: 'الحد الأدنى', key: 'minQuantity', width: 12 },
    { label: 'ملاحظات', key: 'notes', width: 30 }
  ], 'الأصناف', 'الأصناف');
}

function exportEmployeesExcel() {
  exportToExcel(state.data.employees, [
    { label: 'الاسم', key: 'name', width: 25 },
    { label: 'الوظيفة', key: 'position', width: 20 },
    { label: 'الهاتف', key: 'phone', width: 15 },
    { label: 'تاريخ التعيين', key: 'hireDate', width: 15 },
    { label: 'الراتب الأساسي', key: 'basicSalary', width: 15 },
    { label: 'البدلات', key: 'allowances', width: 12 },
    { label: 'الإجمالي', getter: e => (Number(e.basicSalary)||0) + (Number(e.allowances)||0), width: 15 }
  ], 'الموظفون', 'الموظفون');
}

function exportSalesExcel() {
  const from = state.filters.salesFrom || '';
  const to = state.filters.salesTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.sales].filter(s => inRange(s.date)).sort((a,b)=>b.createdAt-a.createdAt);
  exportToExcel(list, [
    { label: 'الرقم', key: 'number', width: 12 },
    { label: 'التاريخ', key: 'date', width: 12 },
    { label: 'العميل', key: 'customerName', width: 25 },
    { label: 'النوع', getter: s => s.type === 'cash' ? 'نقدي' : 'آجل', width: 10 },
    { label: 'المجموع الفرعي', key: 'subtotal', width: 12 },
    { label: 'الخصم', key: 'discount', width: 10 },
    { label: 'الضريبة', key: 'tax', width: 10 },
    { label: 'الإجمالي', key: 'total', width: 12 },
    { label: 'المدفوع', key: 'paid', width: 12 },
    { label: 'المتبقي', key: 'remaining', width: 12 },
    { label: 'ملاحظات', key: 'notes', width: 30 }
  ], 'فواتير_البيع', 'فواتير البيع');
}

function exportPurchasesExcel() {
  const from = state.filters.purchasesFrom || '';
  const to = state.filters.purchasesTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.purchases].filter(p => inRange(p.date)).sort((a,b)=>b.createdAt-a.createdAt);
  exportToExcel(list, [
    { label: 'الرقم', key: 'number', width: 12 },
    { label: 'التاريخ', key: 'date', width: 12 },
    { label: 'المورد', key: 'supplierName', width: 25 },
    { label: 'المجموع الفرعي', key: 'subtotal', width: 12 },
    { label: 'الخصم', key: 'discount', width: 10 },
    { label: 'الضريبة', key: 'tax', width: 10 },
    { label: 'الإجمالي', key: 'total', width: 12 },
    { label: 'المدفوع', key: 'paid', width: 12 },
    { label: 'المتبقي', key: 'remaining', width: 12 }
  ], 'فواتير_الشراء', 'فواتير الشراء');
}

function exportJournalExcel() {
  const from = state.filters.journalFrom || '';
  const to = state.filters.journalTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.journal].filter(j => inRange(j.date)).sort((a,b)=> (a.date||'').localeCompare(b.date||''));
  exportToExcel(list, [
    { label: 'التاريخ', key: 'date', width: 12 },
    { label: 'النوع', getter: j => ({income:'إيراد',expense:'مصروف',customer:'دفعة عميل',employee:'سلفة موظف'}[j.type]||j.type), width: 15 },
    { label: 'الطرف', key: 'partyName', width: 25 },
    { label: 'الوصف', key: 'description', width: 35 },
    { label: 'المبلغ', key: 'amount', width: 12 },
    { label: 'ملاحظات', key: 'notes', width: 30 }
  ], 'القيود_اليومية', 'القيود');
}

function exportReceiptsExcel() {
  const from = state.filters.receiptsFrom || '';
  const to = state.filters.receiptsTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.receipts].filter(r => inRange(r.date)).sort((a,b)=>b.createdAt-a.createdAt);
  exportToExcel(list, [
    { label: 'الرقم', key: 'number', width: 12 },
    { label: 'التاريخ', key: 'date', width: 12 },
    { label: 'العميل', key: 'customerName', width: 25 },
    { label: 'المبلغ', key: 'amount', width: 12 },
    { label: 'طريقة الدفع', key: 'method', width: 15 },
    { label: 'ملاحظات', key: 'notes', width: 30 }
  ], 'سندات_القبض', 'سندات القبض');
}

function exportPaymentsExcel() {
  const from = state.filters.paymentsFrom || '';
  const to = state.filters.paymentsTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.payments].filter(p => inRange(p.date)).sort((a,b)=>b.createdAt-a.createdAt);
  exportToExcel(list, [
    { label: 'الرقم', key: 'number', width: 12 },
    { label: 'التاريخ', key: 'date', width: 12 },
    { label: 'المستفيد', key: 'beneficiary', width: 25 },
    { label: 'المبلغ', key: 'amount', width: 12 },
    { label: 'طريقة الدفع', key: 'method', width: 15 },
    { label: 'ملاحظات', key: 'notes', width: 30 }
  ], 'سندات_الصرف', 'سندات الصرف');
}

function exportAdvancesExcel() {
  const from = state.filters.advancesFrom || '';
  const to = state.filters.advancesTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.advances].filter(a => inRange(a.date)).sort((a,b)=>b.createdAt-a.createdAt);
  exportToExcel(list, [
    { label: 'الرقم', key: 'number', width: 12 },
    { label: 'التاريخ', key: 'date', width: 12 },
    { label: 'الموظف', key: 'employeeName', width: 25 },
    { label: 'المبلغ', key: 'amount', width: 12 },
    { label: 'ملاحظات', key: 'notes', width: 30 }
  ], 'سلف_الموظفين', 'السلف');
}

function exportQuotationsExcel() {
  const list = [...state.data.quotations].sort((a,b)=>b.createdAt-a.createdAt);
  exportToExcel(list, [
    { label: 'الرقم', key: 'number', width: 12 },
    { label: 'التاريخ', key: 'date', width: 12 },
    { label: 'العميل', key: 'customerName', width: 25 },
    { label: 'صالح حتى', key: 'validUntil', width: 12 },
    { label: 'الإجمالي', key: 'total', width: 12 },
    { label: 'الحالة', getter: q => ({pending:'معلّق',accepted:'مقبول',rejected:'مرفوض',converted:'تم تحويله'}[q.status]||q.status), width: 12 },
    { label: 'ملاحظات', key: 'notes', width: 30 }
  ], 'عروض_الأسعار', 'عروض الأسعار');
}

/* ============ الاستيراد ============ */

function importCustomersExcel() {
  downloadTemplateHint(
    ['الاسم', 'الهاتف', 'العنوان', 'الرصيد الافتتاحي', 'ملاحظات'],
    ['أحمد محمد', '770000000', 'صنعاء', '0', ''],
    'قالب_العملاء',
    `importFromExcel(async (rows) => {
      if (!rows.length) { alert('الملف فارغ'); return; }
      if (!confirm('سيتم استيراد ' + rows.length + ' عميل. هل تريد المتابعة؟')) return;
      let imported = 0, skipped = 0;
      for (const row of rows) {
        const name = String(row['الاسم'] || row['name'] || '').trim();
        if (!name) { skipped++; continue; }
        const existing = state.data.customers.find(c => c.name.trim() === name);
        if (existing) { skipped++; continue; }
        await userCol('customers').add({
          name,
          phone: String(row['الهاتف'] || row['phone'] || '').trim(),
          address: String(row['العنوان'] || row['address'] || '').trim(),
          openingBalance: parseNum(row['الرصيد الافتتاحي'] || row['openingBalance'] || 0),
          notes: String(row['ملاحظات'] || row['notes'] || '').trim(),
          createdAt: Date.now()
        });
        imported++;
      }
      alert('✅ تم الاستيراد:\\n- مستورد: ' + imported + '\\n- متجاهل (مكرر أو فارغ): ' + skipped);
    })`
  );
}

function importItemsExcel() {
  downloadTemplateHint(
    ['الكود', 'الاسم', 'الوحدة', 'سعر التكلفة', 'سعر البيع', 'الكمية', 'الحد الأدنى', 'ملاحظات'],
    ['ITM-001', 'أرز', 'كيلو', '10', '15', '100', '10', ''],
    'قالب_الأصناف',
    `importFromExcel(async (rows) => {
      if (!rows.length) { alert('الملف فارغ'); return; }
      if (!confirm('سيتم استيراد ' + rows.length + ' صنف. هل تريد المتابعة؟')) return;
      let imported = 0, skipped = 0;
      for (const row of rows) {
        const name = String(row['الاسم'] || row['name'] || '').trim();
        if (!name) { skipped++; continue; }
        const existing = state.data.items.find(i => i.name.trim() === name);
        if (existing) { skipped++; continue; }
        await userCol('items').add({
          code: String(row['الكود'] || row['code'] || '').trim(),
          name,
          unit: String(row['الوحدة'] || row['unit'] || '').trim(),
          cost: parseNum(row['سعر التكلفة'] || row['cost'] || 0),
          price: parseNum(row['سعر البيع'] || row['price'] || 0),
          quantity: parseNum(row['الكمية'] || row['quantity'] || 0),
          minQuantity: parseNum(row['الحد الأدنى'] || row['minQuantity'] || 0),
          notes: String(row['ملاحظات'] || row['notes'] || '').trim(),
          createdAt: Date.now()
        });
        imported++;
      }
      alert('✅ تم الاستيراد:\\n- مستورد: ' + imported + '\\n- متجاهل: ' + skipped);
    })`
  );
}

function importEmployeesExcel() {
  downloadTemplateHint(
    ['الاسم', 'الوظيفة', 'الهاتف', 'تاريخ التعيين', 'الراتب الأساسي', 'البدلات', 'ملاحظات'],
    ['محمد علي', 'محاسب', '770000000', '2024-01-01', '5000', '500', ''],
    'قالب_الموظفين',
    `importFromExcel(async (rows) => {
      if (!rows.length) { alert('الملف فارغ'); return; }
      if (!confirm('سيتم استيراد ' + rows.length + ' موظف. هل تريد المتابعة؟')) return;
      let imported = 0, skipped = 0;
      for (const row of rows) {
        const name = String(row['الاسم'] || row['name'] || '').trim();
        if (!name) { skipped++; continue; }
        const existing = state.data.employees.find(e => e.name.trim() === name);
        if (existing) { skipped++; continue; }
        await userCol('employees').add({
          name,
          position: String(row['الوظيفة'] || row['position'] || '').trim(),
          phone: String(row['الهاتف'] || row['phone'] || '').trim(),
          hireDate: String(row['تاريخ التعيين'] || row['hireDate'] || today()).trim(),
          basicSalary: parseNum(row['الراتب الأساسي'] || row['basicSalary'] || 0),
          allowances: parseNum(row['البدلات'] || row['allowances'] || 0),
          notes: String(row['ملاحظات'] || row['notes'] || '').trim(),
          createdAt: Date.now()
        });
        imported++;
      }
      alert('✅ تم الاستيراد:\\n- مستورد: ' + imported + '\\n- متجاهل: ' + skipped);
    })`
  );
}

function downloadTemplateHint(headers, sample, filename, importCodeStr) {
  window._pendingImportCode = importCodeStr;
  openModal('استيراد من Excel', `
    <div style="padding:10px;">
      <div style="background:var(--primary-soft);padding:16px;border-radius:12px;margin-bottom:20px;border:1px solid var(--accent);">
        <h4 style="margin:0 0 10px;color:var(--primary);font-size:15px;">📋 خطوات الاستيراد:</h4>
        <ol style="margin:0;padding-right:20px;line-height:2;color:var(--text-2);font-size:13px;">
          <li>اضغط <strong>"تحميل القالب"</strong> لتنزيل ملف Excel نموذجي</li>
          <li>افتح الملف وأضف بياناتك (لا تحذف السطر الأول - العناوين)</li>
          <li>احفظ الملف</li>
          <li>اضغط <strong>"استيراد الملف"</strong> واختر الملف المحفوظ</li>
        </ol>
      </div>

      <div style="background:var(--bg);padding:14px;border-radius:12px;margin-bottom:20px;border:1px solid var(--border);">
        <div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:10px;">📌 الأعمدة المطلوبة:</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${headers.map(h => `<span style="background:#fff;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;border:1px solid var(--border);">${esc(h)}</span>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:10px;">💡 ملاحظة: يمكن استخدام الاسم بالعربية أو الإنجليزية للعمود</div>
      </div>

      <div style="background:var(--orange-soft);padding:12px;border-radius:10px;margin-bottom:20px;font-size:12px;color:var(--orange);font-weight:700;">
        ⚠️ سيتم تجاهل الصفوف المكررة (نفس الاسم موجود مسبقًا)
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
        <button class="btn btn-secondary" onclick="window._doDownloadTemplate()">📥 تحميل القالب</button>
        <button class="btn btn-primary" onclick="window._doImportFile()">📤 استيراد الملف</button>
      </div>
    </div>
  `);
  window._doDownloadTemplate = () => downloadTemplate(headers, filename, sample);
  window._doImportFile = () => {
    closeModal();
    eval(window._pendingImportCode);
  };
}

/* ============================================================
   💼 عروض الأسعار
   ============================================================ */
function renderQuotations(c) {
  const q = (state.filters.quotations || '').toLowerCase();
  const from = state.filters.quotationsFrom || '';
  const to = state.filters.quotationsTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);

  const list = [...state.data.quotations]
    .filter(qt => inRange(qt.date))
    .filter(qt => !q || (qt.number||'').toLowerCase().includes(q) || (qt.customerName||'').toLowerCase().includes(q))
    .sort((a,b)=>b.createdAt-a.createdAt);

  const total = list.reduce((s,x)=>s+(Number(x.total)||0),0);
  const pending = list.filter(x => x.status === 'pending').length;
  const accepted = list.filter(x => x.status === 'accepted').length;
  const converted = list.filter(x => x.status === 'converted').length;

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h2>💼 عروض الأسعار</h2>
        <div class="page-subtitle">إنشاء عروض أسعار للعملاء (لا تؤثر على المخزون)</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <label style="font-size:13px;font-weight:700;">من:</label>
        <input type="date" class="search-input" value="${from}" onchange="state.filters.quotationsFrom=this.value;renderSection()">
        <label style="font-size:13px;font-weight:700;">إلى:</label>
        <input type="date" class="search-input" value="${to}" onchange="state.filters.quotationsTo=this.value;renderSection()">
        <input class="search-input" placeholder="🔍 بحث..." value="${esc(state.filters.quotations||'')}" oninput="setFilter('quotations',this.value)" style="max-width:180px;">
        ${from || to ? `<button class="btn btn-secondary btn-sm" onclick="state.filters.quotationsFrom='';state.filters.quotationsTo='';renderSection()">إعادة تعيين</button>` : ''}
      </div>
      <div class="toolbar-right">
        ${list.length ? `
          <button class="btn btn-secondary" onclick="exportQuotationsExcel()">📊 Excel</button>
          <button class="btn btn-secondary" onclick="exportQuotationsPDF()">📥 PDF</button>
        ` : ''}
        <button class="btn btn-primary" onclick="openQuotationForm()">+ عرض سعر جديد</button>
      </div>
    </div>

    <div class="stats-grid stats-grid-4">
      <div class="stat-card">
        <div class="stat-icon primary">💼</div>
        <div class="stat-body">
          <div class="stat-label">إجمالي العروض</div>
          <div class="stat-value">${list.length}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">⏳</div>
        <div class="stat-body">
          <div class="stat-label">معلّقة</div>
          <div class="stat-value">${pending}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">✅</div>
        <div class="stat-body">
          <div class="stat-label">مقبولة</div>
          <div class="stat-value">${accepted}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">🧾</div>
        <div class="stat-body">
          <div class="stat-label">تم تحويلها</div>
          <div class="stat-value">${converted}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>الإجمالي: ${fmt(total)}</h3>
      </div>
      ${list.length ? `
      <div class="table-wrap"><table>
        <thead><tr>
          <th>الرقم</th><th>التاريخ</th><th>العميل</th><th>صالح حتى</th>
          <th>الإجمالي</th><th>الحالة</th><th>إجراءات</th>
        </tr></thead>
        <tbody>${list.map(qt => {
          const statusLabel = {pending:'⏳ معلّق', accepted:'✅ مقبول', rejected:'❌ مرفوض', converted:'🧾 محوّل'}[qt.status] || qt.status;
          const statusClass = {pending:'badge-orange', accepted:'badge-green', rejected:'badge-red', converted:'badge-blue'}[qt.status] || 'badge-gray';
          return `<tr>
            <td><strong>${esc(qt.number)}</strong></td>
            <td>${esc(qt.date)}</td>
            <td>${esc(qt.customerName||'-')}</td>
            <td>${esc(qt.validUntil||'-')}</td>
            <td>${fmt(qt.total)}</td>
            <td><span class="badge ${statusClass}">${statusLabel}</span></td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="exportQuotationPDF('${qt.id}')" title="PDF">📥</button>
              <button class="btn btn-secondary btn-sm" onclick="printQuotation('${qt.id}')" title="طباعة">🖨️</button>
              ${qt.status !== 'converted' ? `<button class="btn btn-success btn-sm" onclick="convertQuotationToSale('${qt.id}')" title="تحويل إلى فاتورة بيع">🧾</button>` : ''}
              <button class="btn btn-secondary btn-sm" onclick="openQuotationForm('${qt.id}')" title="تعديل">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="softDelete('quotations','${qt.id}')" title="حذف">🗑️</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">💼</div><p>لا توجد عروض أسعار — اضغط "+ عرض سعر جديد" للبدء</p></div>`}
    </div>
  `;
}

let tempQuotationItems = [];

function openQuotationForm(id) {
  const existing = id ? state.data.quotations.find(x => x.id === id) : null;
  if (existing) {
    tempQuotationItems = (existing.items || []).map(it => ({ ...it }));
  } else {
    tempQuotationItems = [];
  }

  const items = state.data.items;
  const validUntil = existing?.validUntil || new Date(Date.now() + 14*24*60*60*1000).toISOString().slice(0,10);

  openModal(existing ? 'تعديل عرض سعر' : 'عرض سعر جديد', `
    <div class="form-row">
      <div class="form-group"><label>التاريخ</label><input type="date" id="qDate" value="${existing?.date||today()}"></div>
      <div class="form-group"><label>صالح حتى</label><input type="date" id="qValidUntil" value="${validUntil}"></div>
    </div>
    <div class="form-group">
      <label>العميل * <small style="color:#64748b;font-weight:400;">(اكتب اسمًا جديدًا أو اختر من القائمة)</small></label>
      <input list="customersListQ" id="qCustomer" placeholder="اكتب أو اختر..." value="${esc(existing?.customerName||'')}" autocomplete="off">
      <datalist id="customersListQ">
        ${state.data.customers.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}
      </datalist>
    </div>
    <div class="form-group"><label>الأصناف</label>
      <div id="quotationItemsContainer"></div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="addQuotationItemRow()">+ إضافة صنف</button>
    </div>
    <div class="form-row-3">
      <div class="form-group"><label>الخصم</label>
        <input type="text" inputmode="decimal" id="qDiscount" value="${existing?.discount||0}" oninput="recalcQuotation()"></div>
      <div class="form-group"><label>الضريبة</label>
        <input type="text" inputmode="decimal" id="qTax" value="${existing?.tax||0}" oninput="recalcQuotation()"></div>
      <div class="form-group"><label>الحالة</label>
        <select id="qStatus">
          <option value="pending" ${existing?.status==='pending'?'selected':''}>⏳ معلّق</option>
          <option value="accepted" ${existing?.status==='accepted'?'selected':''}>✅ مقبول</option>
          <option value="rejected" ${existing?.status==='rejected'?'selected':''}>❌ مرفوض</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label>شروط وأحكام</label>
      <textarea id="qTerms" rows="2" placeholder="مثال: صالح لمدة 14 يوم، الأسعار لا تشمل التوصيل...">${esc(existing?.terms||'')}</textarea></div>
    <div class="form-group"><label>ملاحظات</label>
      <textarea id="qNotes" rows="2">${esc(existing?.notes||'')}</textarea></div>
    <div class="totals-box">
      <div class="totals-row"><span>المجموع الفرعي:</span><strong id="qSubtotal">0</strong></div>
      <div class="totals-row"><span>الخصم:</span><strong id="qDiscDisp">0</strong></div>
      <div class="totals-row"><span>الضريبة:</span><strong id="qTaxDisp">0</strong></div>
      <div class="totals-row grand"><span>الإجمالي:</span><strong id="qTotal">0</strong></div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="saveQuotation(${existing ? `'${existing.id}'` : 'null'})">💾 حفظ</button>
    </div>
  `);
  if (tempQuotationItems.length) renderQuotationItemRows();
  else addQuotationItemRow();
  recalcQuotation();
}

function addQuotationItemRow() {
  tempQuotationItems.push({ itemId:'', name:'', qty:1, price:0, total:0 });
  renderQuotationItemRows();
}

function renderQuotationItemRows() {
  const cont = $('#quotationItemsContainer');
  if (!cont) return;
  const items = state.data.items;
  cont.innerHTML = tempQuotationItems.map((it, i) => `
    <div class="item-row">
      <select onchange="updateQuotationItem(${i},'itemId',this.value)">
        <option value="">-- اختر صنف --</option>
        ${items.map(x=>`<option value="${x.id}" ${it.itemId===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}
      </select>
      <input type="text" inputmode="decimal" value="${it.qty}" onchange="updateQuotationItem(${i},'qty',this.value)" placeholder="الكمية">
      <input type="text" inputmode="decimal" value="${it.price}" onchange="updateQuotationItem(${i},'price',this.value)" placeholder="السعر">
      <span class="row-total">${fmt(it.total)}</span>
      <button class="row-remove" onclick="removeQuotationItem(${i})">×</button>
    </div>
  `).join('');
  recalcQuotation();
}

function updateQuotationItem(i, field, val) {
  const it = tempQuotationItems[i];
  if (!it) return;
  if (field === 'itemId') {
    const item = state.data.items.find(x => x.id === val);
    it.itemId = val; it.name = item?.name || '';
    if (item && !it.price) it.price = Number(item.price) || 0;
  } else if (field === 'qty') it.qty = Math.max(0, parseNum(val) || 0);
  else if (field === 'price') it.price = Math.max(0, parseNum(val) || 0);
  it.total = it.qty * it.price;
  renderQuotationItemRows();
}

function removeQuotationItem(i) {
  tempQuotationItems.splice(i,1);
  renderQuotationItemRows();
}

function recalcQuotation() {
  const sub = tempQuotationItems.reduce((s,i)=>s+i.total,0);
  const disc = parseNum(document.getElementById('qDiscount')?.value);
  const tax = parseNum(document.getElementById('qTax')?.value);
  const total = sub - disc + tax;
  if ($('#qSubtotal')) $('#qSubtotal').textContent = fmt(sub);
  if ($('#qDiscDisp')) $('#qDiscDisp').textContent = fmt(disc);
  if ($('#qTaxDisp')) $('#qTaxDisp').textContent = fmt(tax);
  if ($('#qTotal')) $('#qTotal').textContent = fmt(total);
}

async function saveQuotation(id) {
  const customerName = readStr('#qCustomer');
  const date = readStr('#qDate');
  const validUntil = readStr('#qValidUntil');
  const disc = parseNum(document.getElementById('qDiscount')?.value);
  const tax = parseNum(document.getElementById('qTax')?.value);
  const status = readStr('#qStatus', 'pending');
  const terms = readStr('#qTerms');
  const notes = readStr('#qNotes');

  if (!customerName) { alert('اكتب اسم العميل'); return; }
  const validItems = tempQuotationItems.filter(i => i.itemId && i.qty > 0);
  if (!validItems.length) { alert('أضف صنفاً واحداً على الأقل'); return; }

  const sub = validItems.reduce((s,i)=>s+i.total,0);
  const total = sub - disc + tax;

  const data = {
    date, validUntil, customerName,
    items: validItems, subtotal: sub, discount: disc, tax, total,
    status, terms, notes, updatedAt: Date.now()
  };

  if (id) {
    await userCol('quotations').doc(id).update(data);
  } else {
    const number = await nextNumber('quotations', 'QT');
    await userCol('quotations').add({
      ...data, number, createdAt: Date.now()
    });
  }
  closeModal();
}

function buildQuotationContent(qt) {
  return `
    <div class="print-meta">
      <div><strong>رقم العرض:</strong> ${esc(qt.number)}</div>
      <div><strong>التاريخ:</strong> ${esc(qt.date)}</div>
      <div><strong>العميل:</strong> ${esc(qt.customerName)}</div>
      <div><strong>صالح حتى:</strong> ${esc(qt.validUntil||'-')}</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
      <tbody>${(qt.items||[]).map((it, i)=>`<tr>
        <td>${i+1}</td><td>${esc(it.name)}</td><td>${it.qty}</td>
        <td>${fmt(it.price)}</td><td>${fmt(it.total)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="print-totals">
      <div><span>المجموع الفرعي:</span> <strong>${fmt(qt.subtotal)}</strong></div>
      <div><span>الخصم:</span> <strong>${fmt(qt.discount)}</strong></div>
      <div><span>الضريبة:</span> <strong>${fmt(qt.tax)}</strong></div>
      <div class="grand"><span>الإجمالي:</span> <strong>${fmt(qt.total)}</strong></div>
    </div>
    ${qt.terms ? `<div class="print-notes"><strong>الشروط والأحكام:</strong><br>${esc(qt.terms)}</div>` : ''}
    ${qt.notes ? `<div class="print-notes"><strong>ملاحظات:</strong> ${esc(qt.notes)}</div>` : ''}
    <div style="margin-top:30px;padding:16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;font-size:12px;color:#555;">
      <p style="margin:0 0 8px;"><strong>ملاحظة:</strong> هذا عرض سعر وليس فاتورة ضريبية. الأسعار قابلة للتغيير حسب الكميات المتوفرة.</p>
      <div style="display:flex;justify-content:space-between;margin-top:30px;">
        <div>توقيع العميل: ________________</div>
        <div>توقيع المسؤول: ________________</div>
      </div>
    </div>
  `;
}

function exportQuotationPDF(id) {
  const qt = state.data.quotations.find(x => x.id === id);
  if (!qt) return;
  exportPDF('عرض سعر — ' + qt.number, buildQuotationContent(qt), 'Quotation_' + qt.number);
}

function printQuotation(id) {
  const qt = state.data.quotations.find(x => x.id === id);
  if (!qt) return;
  printHtml(printHeaderHtml('عرض سعر') + buildQuotationContent(qt) + printFooterHtml());
}

function exportQuotationsPDF() {
  const from = state.filters.quotationsFrom || '';
  const to = state.filters.quotationsTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.quotations].filter(qt => inRange(qt.date)).sort((a,b)=>b.createdAt-a.createdAt);
  if (!list.length) { alert('لا توجد عروض للتصدير'); return; }
  const total = list.reduce((s,x)=>s+(Number(x.total)||0),0);
  const period = from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : 'كل الفترات';

  const content = `
    <div class="print-meta">
      <div><strong>الفترة:</strong> ${esc(period)}</div>
      <div><strong>عدد العروض:</strong> ${list.length}</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>صالح حتى</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
      <tbody>${list.map((qt, i) => {
        const statusLabel = {pending:'معلّق', accepted:'مقبول', rejected:'مرفوض', converted:'محوّل'}[qt.status] || qt.status;
        return `<tr>
          <td>${i+1}</td><td>${esc(qt.number)}</td><td>${esc(qt.date)}</td>
          <td>${esc(qt.customerName)}</td><td>${esc(qt.validUntil||'-')}</td>
          <td>${fmt(qt.total)}</td><td>${statusLabel}</td>
        </tr>`;
      }).join('')}</tbody>
      <tfoot><tr style="background:#f0f0f0;font-weight:bold;">
        <td colspan="5">الإجمالي</td><td>${fmt(total)}</td><td></td>
      </tr></tfoot>
    </table>
  `;
  exportPDF('تقرير عروض الأسعار — ' + period, content, 'quotations_report');
}

async function convertQuotationToSale(id) {
  const qt = state.data.quotations.find(x => x.id === id);
  if (!qt) return;
  if (qt.status === 'converted') { alert('تم تحويل هذا العرض مسبقًا'); return; }

  if (!confirm(`تحويل عرض السعر ${qt.number} إلى فاتورة بيع؟\n\nملاحظة: سيتم إنقاص الكميات من المخزون.`)) return;

  const unavailable = [];
  for (const it of qt.items || []) {
    const item = state.data.items.find(x => x.id === it.itemId);
    if (!item) { unavailable.push(it.name + ' (غير موجود)'); continue; }
    if (Number(item.quantity) < Number(it.qty)) {
      unavailable.push(`${it.name} (متوفر: ${item.quantity}، مطلوب: ${it.qty})`);
    }
  }
  if (unavailable.length) {
    alert('⚠️ لا يمكن التحويل — الكميات التالية غير كافية:\n\n' + unavailable.join('\n'));
    return;
  }

  const saleNumber = await nextNumber('sales', 'S');
  let customer = state.data.customers.find(c => c.name.trim() === qt.customerName);
  let customerId = customer?.id;
  if (!customer) {
    const ref = await userCol('customers').add({
      name: qt.customerName, phone: '', address: '', openingBalance: 0, createdAt: Date.now()
    });
    customerId = ref.id;
  }

  await userCol('sales').add({
    number: saleNumber,
    date: today(),
    type: 'credit',
    customerId, customerName: qt.customerName,
    items: qt.items,
    subtotal: qt.subtotal, discount: qt.discount, tax: qt.tax, total: qt.total,
    paid: 0, remaining: qt.total,
    notes: 'محوّلة من عرض سعر: ' + qt.number,
    convertedFromQuotation: qt.number,
    createdAt: Date.now()
  });

  const batch = db.batch();
  (qt.items || []).forEach(it => {
    if (it.itemId) {
      batch.update(userCol('items').doc(it.itemId), {
        quantity: firebase.firestore.FieldValue.increment(-it.qty)
      });
    }
  });
  await batch.commit();

  await userCol('quotations').doc(id).update({
    status: 'converted',
    convertedToSale: saleNumber,
    convertedAt: Date.now()
  });

  alert(`✅ تم إنشاء فاتورة بيع برقم ${saleNumber}\nيمكنك مراجعتها في قسم "فواتير البيع"`);
}

/* ===================== DASHBOARD ===================== */
function renderDashboard(c) {
  const sales = state.data.sales;
  const purchases = state.data.purchases;
  const journal = state.data.journal;
  const customers = state.data.customers;
  const items = state.data.items;
  const employees = state.data.employees;
  const quotations = state.data.quotations;

  const totalSales = sales.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const totalPurchases = purchases.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const totalExpenses = state.data.payments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const totalReceipts = state.data.receipts.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const totalDebts = customers.reduce((s, cu) => {
    const b = customerBalance(cu.id);
    return s + (b > 0 ? b : 0);
  }, 0);
  const totalOwed = customers.reduce((s, cu) => {
    const b = customerBalance(cu.id);
    return s + (b < 0 ? -b : 0);
  }, 0);
  const lowStock = items.filter(i => Number(i.quantity) <= Number(i.minQuantity || 0)).length;
  const todayJournal = journal.filter(j => j.date === today());

  const recentSales = [...sales].sort((a,b)=>b.createdAt-a.createdAt).slice(0, 5);
  const topCustomers = customers.slice(0, 6);
  const debtorsCount = customers.filter(cu => customerBalance(cu.id) > 0).length;
  const creditorsCount = customers.filter(cu => customerBalance(cu.id) < 0).length;
  const pendingQuotations = quotations.filter(q => q.status === 'pending').length;

  const userName = (state.user?.displayName || 'المستخدم').split(' ')[0];

  c.innerHTML = `
    <div class="welcome-banner">
      <div class="welcome-content">
        <h2>مرحباً بك ${esc(userName)} 👋</h2>
        <p>إليك ملخص سريع لنشاط مؤسستك اليوم</p>
      </div>
      <div class="welcome-icon">📊</div>
    </div>

    <div class="stats-grid stats-grid-4">
      <div class="stat-card">
        <div class="stat-icon green">🧾</div>
        <div class="stat-body">
          <div class="stat-label">إجمالي المبيعات</div>
          <div class="stat-value small">${fmt(totalSales)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">📥</div>
        <div class="stat-body">
          <div class="stat-label">إجمالي المشتريات</div>
          <div class="stat-value small">${fmt(totalPurchases)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">📤</div>
        <div class="stat-body">
          <div class="stat-label">المصروفات</div>
          <div class="stat-value small">${fmt(totalExpenses)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">📨</div>
        <div class="stat-body">
          <div class="stat-label">المقبوضات</div>
          <div class="stat-value small">${fmt(totalReceipts)}</div>
        </div>
      </div>
    </div>

    <div class="stats-grid stats-grid-4">
      <div class="stat-card">
        <div class="stat-icon purple">👥</div>
        <div class="stat-body">
          <div class="stat-label">عدد العملاء والموردين</div>
          <div class="stat-value">${customers.length}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon primary">👨‍💼</div>
        <div class="stat-body">
          <div class="stat-label">عدد الموظفين</div>
          <div class="stat-value">${employees.length}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">⚠️</div>
        <div class="stat-body">
          <div class="stat-label">أصناف تحت الحد الأدنى</div>
          <div class="stat-value">${lowStock}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">💰</div>
        <div class="stat-body">
          <div class="stat-label">صافي الديون</div>
          <div class="stat-value small">${fmt(totalDebts - totalOwed)}</div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="card">
        <div class="card-header">
          <h3>🧾 أحدث فواتير البيع</h3>
          <a class="card-action" onclick="showSection('sales')">عرض الكل ←</a>
        </div>
        ${recentSales.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>النوع</th><th>الإجمالي</th><th>المتبقي</th></tr></thead>
            <tbody>${recentSales.map(s => `
              <tr>
                <td><strong>${esc(s.number)}</strong></td>
                <td>${esc(s.date)}</td>
                <td>${esc(s.customerName||'-')}</td>
                <td><span class="badge ${s.type==='cash'?'badge-green':'badge-orange'}">${s.type==='cash'?'نقدي':'آجل'}</span></td>
                <td>${fmt(s.total)}</td>
                <td>${fmt(s.remaining)}</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>` : `<div class="empty-state"><div class="icon">📭</div><p>لا توجد فواتير بعد</p></div>`}
      </div>

      <div class="card">
        <div class="card-header"><h3>⚡ إجراءات سريعة</h3></div>
        <div class="quick-actions">
          <div class="quick-action" onclick="openSaleForm()">
            <div class="qa-icon green">🧾</div>
            <div class="qa-label">فاتورة بيع</div>
          </div>
          <div class="quick-action" onclick="openQuotationForm()">
            <div class="qa-icon primary">💼</div>
            <div class="qa-label">عرض سعر</div>
          </div>
          <div class="quick-action" onclick="openPurchaseForm()">
            <div class="qa-icon blue">📥</div>
            <div class="qa-label">فاتورة شراء</div>
          </div>
          <div class="quick-action" onclick="openCustomerForm()">
            <div class="qa-icon purple">👤</div>
            <div class="qa-label">عميل جديد</div>
          </div>
          <div class="quick-action" onclick="openItemForm()">
            <div class="qa-icon orange">📦</div>
            <div class="qa-label">صنف جديد</div>
          </div>
          <div class="quick-action" onclick="openReceiptForm()">
            <div class="qa-icon primary">📨</div>
            <div class="qa-label">سند قبض</div>
          </div>
          <div class="quick-action" onclick="openPaymentForm()">
            <div class="qa-icon red">📤</div>
            <div class="qa-label">سند صرف</div>
          </div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid equal">
      <div class="card">
        <div class="card-header"><h3>⚠️ تنبيهات النظام</h3></div>
        <div class="alerts-list">
          <div class="alert-item" onclick="showSection('items')">
            <div class="alert-icon orange">📦</div>
            <div class="alert-body">
              <div class="alert-title">أصناف تحت الحد الأدنى</div>
              <div class="alert-sub">تحتاج إعادة تعبئة</div>
            </div>
            <div class="alert-count">${lowStock}</div>
          </div>
          <div class="alert-item" onclick="showSection('customers')">
            <div class="alert-icon red">💸</div>
            <div class="alert-body">
              <div class="alert-title">مدينون لنا</div>
              <div class="alert-sub">عملاء عليهم أرصدة</div>
            </div>
            <div class="alert-count">${debtorsCount}</div>
          </div>
          <div class="alert-item" onclick="showSection('customers')">
            <div class="alert-icon blue">💳</div>
            <div class="alert-body">
              <div class="alert-title">دائنون (لنا عندهم)</div>
              <div class="alert-sub">موردون أو عملاء</div>
            </div>
            <div class="alert-count">${creditorsCount}</div>
          </div>
          <div class="alert-item" onclick="showSection('quotations')">
            <div class="alert-icon purple">💼</div>
            <div class="alert-body">
              <div class="alert-title">عروض أسعار معلّقة</div>
              <div class="alert-sub">بحاجة لمتابعة</div>
            </div>
            <div class="alert-count">${pendingQuotations}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>👥 أرصدة العملاء والموردين</h3>
          <a class="card-action" onclick="showSection('customers')">عرض الكل ←</a>
        </div>
        ${topCustomers.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>الاسم</th><th>الهاتف</th><th>الرصيد</th><th>الحالة</th></tr></thead>
            <tbody>${topCustomers.map(cu => {
              const bal = customerBalance(cu.id);
              const label = bal > 0 ? 'مدين لنا' : bal < 0 ? 'دائن' : 'متعادل';
              const cls = bal > 0 ? 'badge-red' : bal < 0 ? 'badge-green' : 'badge-gray';
              return `<tr>
                <td><strong>${esc(cu.name)}</strong></td>
                <td>${esc(cu.phone||'-')}</td>
                <td><span class="badge ${cls}">${fmt(Math.abs(bal))}</span></td>
                <td>${label}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>` : `<div class="empty-state"><div class="icon">👥</div><p>لا يوجد عملاء بعد</p></div>`}
      </div>
    </div>
  `;
}

/* ===================== JOURNAL ===================== */
function renderJournal(c) {
  const from = state.filters.journalFrom || '';
  const to = state.filters.journalTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.journal]
    .filter(j => inRange(j.date))
    .sort((a,b)=> (b.date||'').localeCompare(a.date||'') || b.createdAt - a.createdAt);

  const income = list.filter(j => j.type === 'income').reduce((s,x)=>s+(Number(x.amount)||0),0);
  const expense = list.filter(j => j.type === 'expense').reduce((s,x)=>s+(Number(x.amount)||0),0);
  const customerPay = list.filter(j => j.type === 'customer').reduce((s,x)=>s+(Number(x.amount)||0),0);
  const employeeAdv = list.filter(j => j.type === 'employee').reduce((s,x)=>s+(Number(x.amount)||0),0);
  const net = income + customerPay - expense - employeeAdv;

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h2>📔 القيود اليومية</h2>
        <div class="page-subtitle">تسجيل الإيرادات والمصروفات والسلف اليومية</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <label style="font-size:13px;font-weight:700;">من:</label>
        <input type="date" class="search-input" value="${from}" onchange="state.filters.journalFrom=this.value;renderSection()">
        <label style="font-size:13px;font-weight:700;">إلى:</label>
        <input type="date" class="search-input" value="${to}" onchange="state.filters.journalTo=this.value;renderSection()">
        <button class="btn btn-secondary btn-sm" onclick="state.filters.journalFrom='';state.filters.journalTo='';renderSection()">إعادة تعيين</button>
      </div>
      <div class="toolbar-right">
        ${list.length ? `
          <button class="btn btn-secondary" onclick="exportJournalExcel()">📊 Excel</button>
          <button class="btn btn-secondary" onclick="exportJournalListPDF()">📥 PDF (${list.length})</button>
        ` : ''}
        <button class="btn btn-primary" onclick="openJournalForm()">+ قيد جديد</button>
      </div>
    </div>

    <div class="stats-grid stats-grid-4">
      <div class="stat-card">
        <div class="stat-icon green">💵</div>
        <div class="stat-body">
          <div class="stat-label">الإيرادات</div>
          <div class="stat-value small">${fmt(income)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">💸</div>
        <div class="stat-body">
          <div class="stat-label">المصروفات</div>
          <div class="stat-value small">${fmt(expense)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">👤</div>
        <div class="stat-body">
          <div class="stat-label">دفعات العملاء</div>
          <div class="stat-value small">${fmt(customerPay)}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">🧑‍💼</div>
        <div class="stat-body">
          <div class="stat-label">سلف الموظفين</div>
          <div class="stat-value small">${fmt(employeeAdv)}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>📋 قائمة القيود ${from || to ? `(${from || 'البداية'} → ${to || 'اليوم'})` : ''}</h3>
        <span class="badge ${net >= 0 ? 'badge-green' : 'badge-red'}">الصافي: ${fmt(net)}</span>
      </div>
      ${list.length ? `
      <div class="table-wrap"><table>
        <thead><tr>
          <th>#</th><th>التاريخ</th><th>النوع</th><th>الطرف</th><th>الوصف</th>
          <th>المبلغ</th><th>إجراءات</th>
        </tr></thead>
        <tbody>${list.map((j, i) => {
          const typeLabel = {
            income: '💵 إيراد', expense: '💸 مصروف',
            customer: '👤 دفعة عميل', employee: '🧑‍💼 سلفة موظف'
          }[j.type] || j.type;
          const typeClass = {
            income: 'badge-green', expense: 'badge-red',
            customer: 'badge-blue', employee: 'badge-orange'
          }[j.type] || 'badge-gray';
          return `<tr>
            <td>${i+1}</td>
            <td>${esc(j.date)}</td>
            <td><span class="badge ${typeClass}">${typeLabel}</span></td>
            <td>${esc(j.partyName||'-')}</td>
            <td>${esc(j.description||'-')}</td>
            <td><strong>${fmt(j.amount)}</strong></td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="exportJournalEntryPDF('${j.id}')">📥</button>
              <button class="btn btn-secondary btn-sm" onclick="printJournalEntry('${j.id}')">🖨️</button>
              <button class="btn btn-danger btn-sm" onclick="deleteJournal('${j.id}')">🗑️</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">📔</div><p>لا توجد قيود — اضغط "+ قيد جديد" للبدء</p></div>`}
    </div>
  `;
}

function openJournalForm() {
  openModal('قيد يومي جديد', `
    <div class="form-row">
      <div class="form-group"><label>التاريخ</label>
        <input type="date" id="jDate" value="${today()}"></div>
      <div class="form-group"><label>النوع *</label>
        <select id="jType" onchange="toggleJournalParty()">
          <option value="income">💵 إيراد (دخل)</option>
          <option value="expense">💸 مصروف (خرج)</option>
          <option value="customer">👤 دفعة من عميل</option>
          <option value="employee">🧑‍💼 سلفة لموظف</option>
        </select>
      </div>
    </div>
    <div class="form-group" id="jPartyCustomer" style="display:none;">
      <label>العميل *</label>
      <input list="jCustomersList" id="jCustomer" placeholder="اكتب أو اختر..." autocomplete="off">
      <datalist id="jCustomersList">
        ${state.data.customers.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}
      </datalist>
    </div>
    <div class="form-group" id="jPartyEmployee" style="display:none;">
      <label>الموظف *</label>
      <select id="jEmployee">
        <option value="">-- اختر موظف --</option>
        ${state.data.employees.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>الوصف / البيان *</label>
      <input id="jDescription" placeholder="مثال: بيع نقدي، كهرباء، دفعة من أحمد..."></div>
    <div class="form-group"><label>المبلغ *</label>
      <input type="text" inputmode="decimal" id="jAmount" value="0"></div>
    <div class="form-group"><label>ملاحظات</label>
      <textarea id="jNotes" rows="2"></textarea></div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick="closeModal()">إلغاء</button>
      <button class="btn btn-primary" onclick="saveJournal()">💾 حفظ القيد</button>
    </div>
  `);
  toggleJournalParty();
}

function toggleJournalParty() {
  const type = readStr('#jType', 'income');
  const custBox = document.getElementById('jPartyCustomer');
  const empBox = document.getElementById('jPartyEmployee');
  if (custBox) custBox.style.display = (type === 'customer') ? 'block' : 'none';
  if (empBox) empBox.style.display = (type === 'employee') ? 'block' : 'none';
}

async function saveJournal() {
  const type = readStr('#jType', 'income');
  const date = readStr('#jDate');
  const description = readStr('#jDescription');
  const amount = readNum('#jAmount');
  const notes = readStr('#jNotes');

  if (!description) { alert('اكتب الوصف'); return; }
  if (amount <= 0) { alert('أدخل مبلغاً صحيحاً'); return; }

  let partyId = '';
  let partyName = '';

  if (type === 'customer') {
    const custName = readStr('#jCustomer');
    if (!custName) { alert('اكتب اسم العميل'); return; }
    let customer = state.data.customers.find(c => c.name.trim() === custName);
    if (!customer) {
      const ref = await userCol('customers').add({
        name: custName, phone: '', address: '', openingBalance: 0, createdAt: Date.now()
      });
      partyId = ref.id;
    } else {
      partyId = customer.id;
    }
    partyName = custName;
  } else if (type === 'employee') {
    const empId = readStr('#jEmployee');
    if (!empId) { alert('اختر موظفاً'); return; }
    const emp = state.data.employees.find(e => e.id === empId);
    if (!emp) { alert('الموظف غير موجود'); return; }
    partyId = empId;
    partyName = emp.name;

    const advNumber = await nextNumber('advances', 'ADV');
    await userCol('advances').add({
      number: advNumber, date,
      employeeId: empId, employeeName: emp.name,
      amount, notes: 'من القيود اليومية: ' + description,
      createdAt: Date.now()
    });
  }

  await userCol('journal').add({
    date, type, partyId, partyName,
    description, amount, notes,
    createdAt: Date.now()
  });

  closeModal();
}

async function deleteJournal(id) {
  if (!confirm('حذف القيد؟')) return;
  await userCol('journal').doc(id).update({ deleted: true, deletedAt: Date.now() });
}

function buildJournalEntryContent(j) {
  const typeLabel = {
    income: '💵 إيراد (دخل)', expense: '💸 مصروف (خرج)',
    customer: '👤 دفعة من عميل', employee: '🧑‍💼 سلفة لموظف'
  }[j.type] || j.type;

  return `
    <div class="print-meta">
      <div><strong>التاريخ:</strong> ${esc(j.date)}</div>
      <div><strong>النوع:</strong> ${esc(typeLabel)}</div>
      ${j.partyName ? `<div><strong>الطرف:</strong> ${esc(j.partyName)}</div>` : ''}
      <div><strong>رقم القيد:</strong> ${esc(j.id.slice(-8).toUpperCase())}</div>
    </div>
    <table>
      <thead><tr><th>البيان / الوصف</th><th>المبلغ</th></tr></thead>
      <tbody><tr><td>${esc(j.description)}</td><td><strong>${fmt(j.amount)}</strong></td></tr></tbody>
      <tfoot><tr style="background:#f0f0f0;font-weight:bold;"><td>الإجمالي</td><td>${fmt(j.amount)}</td></tr></tfoot>
    </table>
    ${j.notes ? `<div class="print-notes"><strong>ملاحظات:</strong> ${esc(j.notes)}</div>` : ''}
    <div class="voucher-box">
      <p style="margin:0;">
        ${j.type === 'income' ? `تم استلام مبلغ وقدره <strong>${fmt(j.amount)}</strong> كإيراد.` : ''}
        ${j.type === 'expense' ? `تم صرف مبلغ وقدره <strong>${fmt(j.amount)}</strong> كمصروف.` : ''}
        ${j.type === 'customer' ? `تم استلام دفعة من السيد/ <strong>${esc(j.partyName)}</strong> بمبلغ <strong>${fmt(j.amount)}</strong>.` : ''}
        ${j.type === 'employee' ? `تم صرف سلفة للموظف <strong>${esc(j.partyName)}</strong> بمبلغ <strong>${fmt(j.amount)}</strong>.` : ''}
      </p>
    </div>
    <div class="signatures">
      <div>توقيع المستلم: ________________</div>
      <div>توقيع المسؤول: ________________</div>
    </div>
  `;
}

function exportJournalEntryPDF(id) {
  const j = state.data.journal.find(x => x.id === id);
  if (!j) return;
  const typeLabel = {
    income: 'سند إيراد', expense: 'سند مصروف',
    customer: 'سند قبض عميل', employee: 'سند سلفة موظف'
  }[j.type] || 'قيد يومي';
  exportPDF(typeLabel, buildJournalEntryContent(j), typeLabel + '_' + j.date + '_' + j.id.slice(-6));
}

function printJournalEntry(id) {
  const j = state.data.journal.find(x => x.id === id);
  if (!j) return;
  const typeLabel = {
    income: 'سند إيراد', expense: 'سند مصروف',
    customer: 'سند قبض عميل', employee: 'سند سلفة موظف'
  }[j.type] || 'قيد يومي';
  printHtml(printHeaderHtml(typeLabel) + buildJournalEntryContent(j) + printFooterHtml());
}

function exportJournalListPDF() {
  const from = state.filters.journalFrom || '';
  const to = state.filters.journalTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.journal].filter(j => inRange(j.date))
    .sort((a,b)=> (a.date||'').localeCompare(b.date||'') || a.createdAt - b.createdAt);
  if (!list.length) { alert('لا توجد قيود للتصدير'); return; }

  const income = list.filter(j => j.type === 'income').reduce((s,x)=>s+(Number(x.amount)||0),0);
  const expense = list.filter(j => j.type === 'expense').reduce((s,x)=>s+(Number(x.amount)||0),0);
  const cust = list.filter(j => j.type === 'customer').reduce((s,x)=>s+(Number(x.amount)||0),0);
  const emp = list.filter(j => j.type === 'employee').reduce((s,x)=>s+(Number(x.amount)||0),0);
  const net = income + cust - expense - emp;
  const period = from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : 'كل الفترات';

  const content = `
    <div class="print-meta">
      <div><strong>الفترة:</strong> ${esc(period)}</div>
      <div><strong>عدد القيود:</strong> ${list.length}</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>التاريخ</th><th>النوع</th><th>الطرف</th><th>الوصف</th><th>المبلغ</th></tr></thead>
      <tbody>${list.map((j,i)=>{
        const tl = {income:'إيراد', expense:'مصروف', customer:'دفعة عميل', employee:'سلفة موظف'}[j.type] || j.type;
        return `<tr>
          <td>${i+1}</td><td>${esc(j.date)}</td><td>${tl}</td>
          <td>${esc(j.partyName||'-')}</td>
          <td>${esc(j.description)}</td>
          <td>${fmt(j.amount)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
    <div class="print-totals">
      <div><span>إجمالي الإيرادات:</span><strong>${fmt(income)}</strong></div>
      <div><span>إجمالي دفعات العملاء:</span><strong>${fmt(cust)}</strong></div>
      <div><span>إجمالي المصروفات:</span><strong>${fmt(expense)}</strong></div>
      <div><span>إجمالي سلف الموظفين:</span><strong>${fmt(emp)}</strong></div>
      <div class="grand"><span>الصافي:</span><strong>${fmt(net)}</strong></div>
    </div>
  `;
  exportPDF('تقرير القيود اليومية — ' + period, content, 'journal_report');
}

/* ===================== SALES ===================== */
function renderSales(c) {
  const q = (state.filters.sales || '').toLowerCase();
  const from = state.filters.salesFrom || '';
  const to = state.filters.salesTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);

  const list = [...state.data.sales]
    .filter(s => inRange(s.date))
    .filter(s => !q || (s.number||'').toLowerCase().includes(q) || (s.customerName||'').toLowerCase().includes(q))
    .sort((a,b)=>b.createdAt-a.createdAt);

  const total = list.reduce((s,x)=>s+(Number(x.total)||0),0);
  const paid = list.reduce((s,x)=>s+(Number(x.paid)||0),0);
  const rem = list.reduce((s,x)=>s+(Number(x.remaining)||0),0);

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h2>🧾 فواتير البيع</h2>
        <div class="page-subtitle">إدارة كل فواتير البيع الصادرة</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <label style="font-size:13px;font-weight:700;">من:</label>
        <input type="date" class="search-input" value="${from}" onchange="state.filters.salesFrom=this.value;renderSection()">
        <label style="font-size:13px;font-weight:700;">إلى:</label>
        <input type="date" class="search-input" value="${to}" onchange="state.filters.salesTo=this.value;renderSection()">
        <input class="search-input" placeholder="🔍 بحث..." value="${esc(state.filters.sales||'')}" oninput="setFilter('sales',this.value)" style="max-width:180px;">
        ${from || to ? `<button class="btn btn-secondary btn-sm" onclick="state.filters.salesFrom='';state.filters.salesTo='';renderSection()">إعادة تعيين</button>` : ''}
      </div>
      <div class="toolbar-right">
        ${list.length ? `
          <button class="btn btn-secondary" onclick="exportSalesExcel()">📊 Excel</button>
          <button class="btn btn-secondary" onclick="exportSalesPDF('${from}','${to}')">📥 PDF (${list.length})</button>
          <button class="btn btn-secondary" onclick="printSalesList()">🖨️</button>
        ` : ''}
        <button class="btn btn-primary" onclick="openSaleForm()">+ فاتورة بيع</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>الإجمالي: ${fmt(total)} — المدفوع: ${fmt(paid)} — المتبقي: ${fmt(rem)}</h3>
      </div>
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
              <button class="btn btn-secondary btn-sm" onclick="exportSalePDF('${s.id}')">📥</button>
              <button class="btn btn-secondary btn-sm" onclick="printSale('${s.id}')">🖨️</button>
              <button class="btn btn-danger btn-sm" onclick="deleteSale('${s.id}')">🗑️</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">🧾</div><p>لا توجد فواتير بيع</p></div>`}
    </div>
  `;
}

function buildSaleContent(s) {
  return `
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
  `;
}

function exportSalePDF(id) {
  const s = state.data.sales.find(x => x.id === id);
  if (!s) return;
  exportPDF('فاتورة بيع — ' + s.number, buildSaleContent(s), 'Sale_' + s.number);
}

function exportSalesPDF(from, to) {
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.sales].filter(s => inRange(s.date)).sort((a,b)=>b.createdAt-a.createdAt);
  if (!list.length) { alert('لا توجد فواتير للتصدير'); return; }
  const total = list.reduce((s,x)=>s+(Number(x.total)||0),0);
  const paid = list.reduce((s,x)=>s+(Number(x.paid)||0),0);
  const rem = list.reduce((s,x)=>s+(Number(x.remaining)||0),0);
  const period = from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : 'كل الفترات';

  const content = `
    <div class="print-meta">
      <div><strong>الفترة:</strong> ${esc(period)}</div>
      <div><strong>عدد الفواتير:</strong> ${list.length}</div>
    </div>
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
  `;
  exportPDF('تقرير فواتير البيع — ' + period, content, 'sales_report');
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
      <input list="customersListS" id="saleCustomer" placeholder="اكتب أو اختر..." autocomplete="off">
      <datalist id="customersListS">
        ${state.data.customers.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}
      </datalist>
    </div>
    <div class="form-group"><label>الأصناف</label>
      <div id="saleItemsContainer"></div>
      ${items.length 
        ? `<button type="button" class="btn btn-secondary btn-sm" onclick="addSaleItemRow()">+ إضافة صنف</button>` 
        : `<div style="padding:12px;background:var(--orange-soft);border-radius:8px;color:var(--orange);font-size:13px;font-weight:700;">⚠️ لا توجد أصناف في المخزون. أضف أصنافًا أولًا من فاتورة شراء.</div>`}
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
      <input type="text" inputmode="decimal" value="${it.qty}" onchange="updateSaleItem(${i},'qty',this.value)" placeholder="الكمية">
      <input type="text" inputmode="decimal" value="${it.price}" onchange="updateSaleItem(${i},'price',this.value)" placeholder="السعر">
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
  } else if (field === 'qty') it.qty = Math.max(0, parseNum(val) || 0);
  else if (field === 'price') it.price = Math.max(0, parseNum(val) || 0);
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
  const paid = parseNum(document.getElementById('salePaid')?.value);
  const disc = parseNum(document.getElementById('saleDiscount')?.value);
  const tax = parseNum(document.getElementById('saleTax')?.value);
  const customerName = readStr('#saleCustomer');
  const date = readStr('#saleDate');
  const type = readStr('#saleType', 'cash');
  const notes = readStr('#saleNotes');

  if (!customerName) { alert('اكتب اسم العميل'); return; }
  const validItems = tempSaleItems.filter(i => i.itemId && i.qty > 0);
  if (!validItems.length) { alert('أضف صنفاً واحداً على الأقل'); return; }

  const sub = validItems.reduce((s,i)=>s+i.total,0);
  const total = sub - disc + tax;
  const remaining = total - paid;

  let customer = state.data.customers.find(c => c.name.trim() === customerName);
  let customerId = customer?.id;
  if (!customer) {
    const ref = await userCol('customers').add({
      name: customerName, phone: '', address: '', openingBalance: 0, createdAt: Date.now()
    });
    customerId = ref.id;
  }

  const number = await nextNumber('sales', 'S');
  await userCol('sales').add({
    number, date, type, customerId, customerName,
    items: validItems, subtotal: sub, discount: disc, tax, total, paid,
    remaining, notes, createdAt: Date.now()
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
  printHtml(printHeaderHtml('فاتورة بيع') + buildSaleContent(s) + printFooterHtml());
}

function printSalesList() {
  const from = state.filters.salesFrom || '';
  const to = state.filters.salesTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.sales].filter(s => inRange(s.date)).sort((a,b)=>b.createdAt-a.createdAt);
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
  const from = state.filters.purchasesFrom || '';
  const to = state.filters.purchasesTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);

  const list = [...state.data.purchases]
    .filter(p => inRange(p.date))
    .filter(p => !q || (p.number||'').toLowerCase().includes(q) || (p.supplierName||'').toLowerCase().includes(q))
    .sort((a,b)=>b.createdAt-a.createdAt);

  const total = list.reduce((s,x)=>s+(Number(x.total)||0),0);
  const paid = list.reduce((s,x)=>s+(Number(x.paid)||0),0);
  const rem = list.reduce((s,x)=>s+(Number(x.remaining)||0),0);

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h2>📥 فواتير الشراء</h2>
        <div class="page-subtitle">إدارة فواتير الشراء الواردة</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <label style="font-size:13px;font-weight:700;">من:</label>
        <input type="date" class="search-input" value="${from}" onchange="state.filters.purchasesFrom=this.value;renderSection()">
        <label style="font-size:13px;font-weight:700;">إلى:</label>
        <input type="date" class="search-input" value="${to}" onchange="state.filters.purchasesTo=this.value;renderSection()">
        <input class="search-input" placeholder="🔍 بحث..." value="${esc(state.filters.purchases||'')}" oninput="setFilter('purchases',this.value)" style="max-width:180px;">
        ${from || to ? `<button class="btn btn-secondary btn-sm" onclick="state.filters.purchasesFrom='';state.filters.purchasesTo='';renderSection()">إعادة تعيين</button>` : ''}
      </div>
      <div class="toolbar-right">
        ${list.length ? `
          <button class="btn btn-secondary" onclick="exportPurchasesExcel()">📊 Excel</button>
          <button class="btn btn-secondary" onclick="exportPurchasesPDF('${from}','${to}')">📥 PDF (${list.length})</button>
          <button class="btn btn-secondary" onclick="printPurchasesList()">🖨️</button>
        ` : ''}
        <button class="btn btn-primary" onclick="openPurchaseForm()">+ فاتورة شراء</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>الإجمالي: ${fmt(total)} — المدفوع: ${fmt(paid)} — المتبقي: ${fmt(rem)}</h3>
      </div>
      ${list.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>الرقم</th><th>التاريخ</th><th>المورد</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>إجراءات</th></tr></thead>
        <tbody>${list.map(p => `
          <tr>
            <td><strong>${esc(p.number)}</strong></td><td>${esc(p.date)}</td>
            <td>${esc(p.supplierName||'-')}</td><td>${fmt(p.total)}</td>
            <td>${fmt(p.paid)}</td><td>${fmt(p.remaining)}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="exportPurchasePDF('${p.id}')">📥</button>
              <button class="btn btn-secondary btn-sm" onclick="printPurchase('${p.id}')">🖨️</button>
              <button class="btn btn-danger btn-sm" onclick="deletePurchase('${p.id}')">🗑️</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">📥</div><p>لا توجد فواتير شراء</p></div>`}
    </div>
  `;
}

function buildPurchaseContent(p) {
  return `
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
  `;
}

function exportPurchasePDF(id) {
  const p = state.data.purchases.find(x => x.id === id);
  if (!p) return;
  exportPDF('فاتورة شراء — ' + p.number, buildPurchaseContent(p), 'Purchase_' + p.number);
}

function exportPurchasesPDF(from, to) {
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.purchases].filter(p => inRange(p.date)).sort((a,b)=>b.createdAt-a.createdAt);
  if (!list.length) { alert('لا توجد فواتير للتصدير'); return; }
  const total = list.reduce((s,x)=>s+(Number(x.total)||0),0);
  const paid = list.reduce((s,x)=>s+(Number(x.paid)||0),0);
  const rem = list.reduce((s,x)=>s+(Number(x.remaining)||0),0);
  const period = from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : 'كل الفترات';

  const content = `
    <div class="print-meta">
      <div><strong>الفترة:</strong> ${esc(period)}</div>
      <div><strong>عدد الفواتير:</strong> ${list.length}</div>
    </div>
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
  `;
  exportPDF('تقرير فواتير الشراء — ' + period, content, 'purchases_report');
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
        <input list="customersListP" id="pSupplier" placeholder="اكتب أو اختر..." autocomplete="off">
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
      <input type="text" inputmode="decimal" value="${it.qty}" 
             onchange="updatePurchaseItem(${i},'qty',this.value)" placeholder="الكمية">
      <input type="text" inputmode="decimal" value="${it.price}" 
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
  } else if (field === 'qty') it.qty = Math.max(0, parseNum(val) || 0);
  else if (field === 'price') it.price = Math.max(0, parseNum(val) || 0);
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
  const paid = parseNum(document.getElementById('pPaid')?.value);
  const disc = parseNum(document.getElementById('pDiscount')?.value);
  const tax = parseNum(document.getElementById('pTax')?.value);
  const supplierName = readStr('#pSupplier');
  const date = readStr('#pDate');
  const notes = readStr('#pNotes');

  if (!supplierName) { alert('اكتب اسم المورد'); return; }
  const validItems = tempPurchaseItems.filter(i => i.itemName && i.qty > 0);
  if (!validItems.length) { alert('أضف صنفاً واحداً على الأقل'); return; }

  const sub = validItems.reduce((s,i)=>s+i.total,0);
  const total = sub - disc + tax;
  const remaining = total - paid;

  let supplier = state.data.customers.find(c => c.name.trim() === supplierName);
  let supplierId = supplier?.id;
  if (!supplier) {
    const ref = await userCol('customers').add({
      name: supplierName, phone: '', address: '', openingBalance: 0, createdAt: Date.now()
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
        name: it.itemName.trim(), code: '', unit: '', quantity: 0,
        cost: it.price, price: Math.round(it.price * 1.2 * 100) / 100,
        minQuantity: 0, notes: '', createdAt: Date.now()
      });
      itemId = ref.id;
    }
    finalItems.push({ itemId, name: it.itemName.trim(), qty: it.qty, price: it.price, total: it.total });
    inventoryUpdates.push({ itemId, qty: it.qty, cost: it.price });
  }

  const number = await nextNumber('purchases', 'P');
  await userCol('purchases').add({
    number, date, supplierId, supplierName,
    items: finalItems, subtotal: sub, discount: disc, tax, total, paid,
    remaining, notes, createdAt: Date.now()
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
  printHtml(printHeaderHtml('فاتورة شراء') + buildPurchaseContent(p) + printFooterHtml());
}

function printPurchasesList() {
  const from = state.filters.purchasesFrom || '';
  const to = state.filters.purchasesTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.purchases].filter(p => inRange(p.date)).sort((a,b)=>b.createdAt-a.createdAt);
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
    <div class="page-header">
      <div>
        <h2>👥 العملاء والموردون</h2>
        <div class="page-subtitle">إدارة الأطراف والأرصدة</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" placeholder="🔍 بحث بالاسم..." value="${esc(state.filters.customers||'')}" oninput="setFilter('customers',this.value)">
      </div>
      <div class="toolbar-right">
        ${list.length ? `
          <button class="btn btn-secondary" onclick="exportCustomersExcel()">📊 Excel</button>
          <button class="btn btn-secondary" onclick="importCustomersExcel()">📤 استيراد</button>
          <button class="btn btn-secondary" onclick="exportCustomersPDF()">📥 PDF</button>
          <button class="btn btn-secondary" onclick="printCustomersList()">🖨️</button>
        ` : ''}
        <button class="btn btn-primary" onclick="openCustomerForm()">+ طرف جديد</button>
      </div>
    </div>

    <div class="card">
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
              <button class="btn btn-secondary btn-sm" onclick="exportCustomerStatementPDF('${cu.id}')">📥</button>
              <button class="btn btn-secondary btn-sm" onclick="printCustomerStatement('${cu.id}')">🖨️</button>
              <button class="btn btn-secondary btn-sm" onclick="openCustomerForm('${cu.id}')">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="softDelete('customers','${cu.id}')">🗑️</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">👥</div><p>لا توجد بيانات</p></div>`}
    </div>
  `;
}

function exportCustomersPDF() {
  const list = state.data.customers;
  const content = `
    <table>
      <thead><tr><th>#</th><th>الاسم</th><th>الهاتف</th><th>العنوان</th><th>الرصيد</th><th>الحالة</th></tr></thead>
      <tbody>${list.map((cu, i) => {
        const bal = customerBalance(cu.id);
        const label = bal > 0 ? 'مدين لنا' : bal < 0 ? 'دائن (لنا عنده)' : 'متعادل';
        return `<tr><td>${i+1}</td><td>${esc(cu.name)}</td><td>${esc(cu.phone||'-')}</td>
          <td>${esc(cu.address||'-')}</td><td>${fmt(Math.abs(bal))}</td><td>${label}</td></tr>`;
      }).join('')}</tbody>
    </table>
  `;
  exportPDF('تقرير العملاء والموردين', content, 'customers_report');
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

function buildCustomerStatementContent(custId) {
  const cu = state.data.customers.find(x => x.id === custId);
  if (!cu) return '';
  const sales = state.data.sales.filter(s => s.customerId === custId);
  const purchases = state.data.purchases.filter(p => p.supplierId === custId);
  const receipts = state.data.receipts.filter(r => r.customerId === custId);
  const payments = state.data.payments.filter(p => p.partyId === custId);
  const journalPay = state.data.journal.filter(j => j.type === 'customer' && j.partyId === custId);

  const movements = [
    ...sales.map(s => ({ date: s.date, type: 'فاتورة بيع', number: s.number, debit: Number(s.total)||0, credit: Number(s.paid)||0 })),
    ...purchases.map(p => ({ date: p.date, type: 'فاتورة شراء', number: p.number, debit: Number(p.paid)||0, credit: Number(p.total)||0 })),
    ...receipts.map(r => ({ date: r.date, type: 'سند قبض', number: r.number, debit: 0, credit: Number(r.amount)||0 })),
    ...payments.map(p => ({ date: p.date, type: 'سند صرف', number: p.number, debit: Number(p.amount)||0, credit: 0 })),
    ...journalPay.map(j => ({ date: j.date, type: 'قيد يومي', number: j.id.slice(-6), debit: 0, credit: Number(j.amount)||0 }))
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

  return `
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
  `;
}

function exportCustomerStatementPDF(custId) {
  const cu = state.data.customers.find(x => x.id === custId);
  if (!cu) return;
  exportPDF('كشف حساب — ' + cu.name, buildCustomerStatementContent(custId), 'Statement_' + cu.name.replace(/\s+/g, '_'));
}

function printCustomerStatement(custId) {
  const cu = state.data.customers.find(x => x.id === custId);
  if (!cu) return;
  printHtml(printHeaderHtml('كشف حساب - ' + cu.name) + buildCustomerStatementContent(custId) + printFooterHtml());
}

function openCustomerForm(id) {
  const cu = id ? state.data.customers.find(x => x.id === id) : null;
  openModal(cu ? 'تعديل طرف' : 'طرف جديد', `
    <div class="form-group"><label>الاسم *</label><input id="cuName" value="${esc(cu?.name||'')}"></div>
    <div class="form-row">
      <div class="form-group"><label>الهاتف</label><input id="cuPhone" value="${esc(cu?.phone||'')}"></div>
      <div class="form-group"><label>الرصيد الافتتاحي</label><input type="text" inputmode="decimal" id="cuOpening" value="${cu?.openingBalance||0}"></div>
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
    <div class="page-header">
      <div>
        <h2>📦 الأصناف والمخزون</h2>
        <div class="page-subtitle">إدارة الأصناف والكميات</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" placeholder="🔍 بحث..." value="${esc(state.filters.items||'')}" oninput="setFilter('items',this.value)">
      </div>
      <div class="toolbar-right">
        ${list.length ? `
          <button class="btn btn-secondary" onclick="exportItemsExcel()">📊 Excel</button>
          <button class="btn btn-secondary" onclick="importItemsExcel()">📤 استيراد</button>
          <button class="btn btn-secondary" onclick="exportItemsPDF()">📥 PDF</button>
          <button class="btn btn-secondary" onclick="printItemsList()">🖨️</button>
        ` : ''}
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
      </table></div>` : `<div class="empty-state"><div class="icon">📦</div><p>لا توجد أصناف</p></div>`}
    </div>
  `;
}

function exportItemsPDF() {
  const list = state.data.items;
  const totalValue = list.reduce((s,x)=>s+((Number(x.quantity)||0)*(Number(x.cost)||0)),0);
  const content = `
    <table>
      <thead><tr><th>#</th><th>الكود</th><th>الاسم</th><th>الوحدة</th><th>التكلفة</th><th>البيع</th><th>الكمية</th><th>القيمة</th></tr></thead>
      <tbody>${list.map((it, i)=>`<tr>
        <td>${i+1}</td><td>${esc(it.code||'-')}</td><td>${esc(it.name)}</td>
        <td>${esc(it.unit||'-')}</td><td>${fmt(it.cost)}</td><td>${fmt(it.price)}</td>
        <td>${it.quantity||0}</td><td>${fmt((Number(it.quantity)||0)*(Number(it.cost)||0))}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr style="background:#f0f0f0;font-weight:bold;">
        <td colspan="7">إجمالي قيمة المخزون</td><td>${fmt(totalValue)}</td>
      </tr></tfoot>
    </table>
  `;
  exportPDF('تقرير الأصناف والمخزون', content, 'items_report');
}

function printItemsList() {
  const list = state.data.items;
  if (!list.length) return;
  const totalValue = list.reduce((s,x)=>s+((Number(x.quantity)||0)*(Number(x.cost)||0)),0);
  const html = `
    ${printHeaderHtml('تقرير الأصناف والمخزون')}
    <table>
      <thead><tr><th>#</th><th>الكود</th><th>الاسم</th><th>الوحدة</th><th>التكلفة</th><th>البيع</th><th>الكمية</th><th>القيمة</th></tr></thead>
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
      <div class="form-group"><label>سعر التكلفة</label><input type="text" inputmode="decimal" id="itCost" value="${it?.cost||0}"></div>
      <div class="form-group"><label>سعر البيع</label><input type="text" inputmode="decimal" id="itPrice" value="${it?.price||0}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>الكمية الحالية</label><input type="text" inputmode="decimal" id="itQty" value="${it?.quantity||0}" ${it?'disabled':''}></div>
      <div class="form-group"><label>الحد الأدنى</label><input type="text" inputmode="decimal" id="itMin" value="${it?.minQuantity||0}"></div>
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
    <div class="page-header">
      <div>
        <h2>👨‍💼 الموظفون</h2>
        <div class="page-subtitle">إدارة بيانات الموظفين والرواتب</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <input class="search-input" placeholder="🔍 بحث..." value="${esc(state.filters.employees||'')}" oninput="setFilter('employees',this.value)">
      </div>
      <div class="toolbar-right">
        ${list.length ? `
          <button class="btn btn-secondary" onclick="exportEmployeesExcel()">📊 Excel</button>
          <button class="btn btn-secondary" onclick="importEmployeesExcel()">📤 استيراد</button>
          <button class="btn btn-secondary" onclick="exportEmployeesPDF()">📥 PDF</button>
          <button class="btn btn-secondary" onclick="printEmployeesList()">🖨️</button>
        ` : ''}
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
      </table></div>` : `<div class="empty-state"><div class="icon">👨‍💼</div><p>لا يوجد موظفون</p></div>`}
    </div>
  `;
}

function exportEmployeesPDF() {
  const list = state.data.employees;
  const totalBasic = list.reduce((s,x)=>s+(Number(x.basicSalary)||0),0);
  const totalAllow = list.reduce((s,x)=>s+(Number(x.allowances)||0),0);
  const content = `
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
  `;
  exportPDF('تقرير الموظفين', content, 'employees_report');
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
      <div class="form-group"><label>الراتب الأساسي</label>
        <input type="text" inputmode="decimal" id="emBasic" value="${e?.basicSalary ?? 0}"></div>
      <div class="form-group"><label>البدلات</label>
        <input type="text" inputmode="decimal" id="emAllow" value="${e?.allowances ?? 0}"></div>
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
  const basicSalary = readNum('#emBasic');
  const allowances = readNum('#emAllow');
  const data = {
    name,
    position: readStr('#emPos'),
    phone: readStr('#emPhone'),
    hireDate: readStr('#emHire'),
    basicSalary, allowances,
    notes: readStr('#emNotes'),
    updatedAt: Date.now()
  };
  if (id) await userCol('employees').doc(id).update(data);
  else await userCol('employees').add({ ...data, createdAt: Date.now() });
  closeModal();
}

/* ===================== ADVANCES ===================== */
function renderAdvances(c) {
  const from = state.filters.advancesFrom || '';
  const to = state.filters.advancesTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.advances].filter(a => inRange(a.date)).sort((a,b)=>b.createdAt-a.createdAt);

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h2>💵 سلف الموظفين</h2>
        <div class="page-subtitle">إدارة السلف الممنوحة للموظفين</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <label style="font-size:13px;font-weight:700;">من:</label>
        <input type="date" class="search-input" value="${from}" onchange="state.filters.advancesFrom=this.value;renderSection()">
        <label style="font-size:13px;font-weight:700;">إلى:</label>
        <input type="date" class="search-input" value="${to}" onchange="state.filters.advancesTo=this.value;renderSection()">
        ${from || to ? `<button class="btn btn-secondary btn-sm" onclick="state.filters.advancesFrom='';state.filters.advancesTo='';renderSection()">إعادة تعيين</button>` : ''}
      </div>
      <div class="toolbar-right">
        ${list.length ? `
          <button class="btn btn-secondary" onclick="exportAdvancesExcel()">📊 Excel</button>
          <button class="btn btn-secondary" onclick="exportAdvancesPDF('${from}','${to}')">📥 PDF (${list.length})</button>
          <button class="btn btn-secondary" onclick="printAdvancesList()">🖨️</button>
        ` : ''}
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
              <button class="btn btn-secondary btn-sm" onclick="exportAdvancePDF('${a.id}')">📥</button>
              <button class="btn btn-secondary btn-sm" onclick="printAdvance('${a.id}')">🖨️</button>
              <button class="btn btn-danger btn-sm" onclick="softDelete('advances','${a.id}')">🗑️</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">💵</div><p>لا توجد سلف</p></div>`}
    </div>
  `;
}

function buildAdvanceContent(a) {
  return `
    <div class="print-meta">
      <div><strong>الرقم:</strong> ${esc(a.number)}</div>
      <div><strong>التاريخ:</strong> ${esc(a.date)}</div>
      <div><strong>الموظف:</strong> ${esc(a.employeeName)}</div>
      <div><strong>المبلغ:</strong> ${fmt(a.amount)}</div>
    </div>
    <div class="voucher-box">
      <p style="margin:0;">تم صرف مبلغ <strong>${fmt(a.amount)}</strong> للموظف <strong>${esc(a.employeeName)}</strong> كسلفة على الراتب.</p>
      ${a.notes ? `<p><strong>ملاحظات:</strong> ${esc(a.notes)}</p>` : ''}
    </div>
    <div class="signatures">
      <div>توقيع الموظف: ________________</div>
      <div>توقيع المسؤول: ________________</div>
    </div>
  `;
}

function exportAdvancePDF(id) {
  const a = state.data.advances.find(x => x.id === id);
  if (!a) return;
  exportPDF('سند سلفة — ' + a.number, buildAdvanceContent(a), 'Advance_' + a.number);
}

function exportAdvancesPDF(from, to) {
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.advances].filter(a => inRange(a.date)).sort((a,b)=>b.createdAt-a.createdAt);
  if (!list.length) { alert('لا توجد سلف للتصدير'); return; }
  const total = list.reduce((s,x)=>s+(Number(x.amount)||0),0);
  const period = from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : 'كل الفترات';
  const content = `
    <div class="print-meta">
      <div><strong>الفترة:</strong> ${esc(period)}</div>
      <div><strong>عدد السلف:</strong> ${list.length}</div>
    </div>
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
  `;
  exportPDF('تقرير سلف الموظفين — ' + period, content, 'advances_report');
}

function printAdvancesList() {
  const from = state.filters.advancesFrom || '';
  const to = state.filters.advancesTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.advances].filter(a => inRange(a.date)).sort((a,b)=>b.createdAt-a.createdAt);
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
  printHtml(printHeaderHtml('سند سلفة') + buildAdvanceContent(a) + printFooterHtml());
}

function openAdvanceForm() {
  if (!state.data.employees.length) { alert('أضف موظفاً أولاً'); return; }
  openModal('سلفة موظف جديدة', `
    <div class="form-row">
      <div class="form-group"><label>التاريخ</label><input type="date" id="advDate" value="${today()}"></div>
      <div class="form-group"><label>الموظف</label>
        <select id="advEmp">
          ${state.data.employees.map(e=>`<option value="${e.id}">${esc(e.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group"><label>المبلغ *</label><input type="text" inputmode="decimal" id="advAmount" value="0"></div>
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
    <div class="page-header">
      <div>
        <h2>💼 الرواتب</h2>
        <div class="page-subtitle">إدارة رواتب الموظفين الشهرية</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <label style="font-size:13px;font-weight:700;">الشهر:</label>
        <input type="month" class="search-input" value="${month}" onchange="state.filters.salMonth=this.value;renderSection()">
      </div>
      <div class="toolbar-right">
        ${emps.length ? `
          <button class="btn btn-secondary" onclick="exportSalariesPDF('${month}')">📥 PDF</button>
          <button class="btn btn-secondary" onclick="printSalariesReport('${month}')">🖨️</button>
        ` : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>رواتب شهر ${month}</h3>
      </div>
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
      </table></div>` : `<div class="empty-state"><div class="icon">💼</div><p>لا يوجد موظفون</p></div>`}
    </div>
  `;
}

function exportSalariesPDF(month) {
  const emps = state.data.employees;
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
  const content = `
    <table>
      <thead><tr><th>#</th><th>الموظف</th><th>الوظيفة</th><th>الأساسي</th><th>البدلات</th><th>الإجمالي</th><th>السلف</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="background:#f0f0f0;font-weight:bold;">
        <td colspan="5">الإجمالي</td>
        <td>${fmt(totals.total)}</td><td>${fmt(totals.advances)}</td>
        <td>${fmt(totals.paid)}</td><td>${fmt(totals.remaining)}</td>
      </tr></tfoot>
    </table>
  `;
  exportPDF('كشف رواتب شهر ' + month, content, 'salaries_' + month);
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
    <div class="form-group"><label>المبلغ المصروف *</label>
      <input type="text" inputmode="decimal" id="salAmount" value="${Math.max(0, m.remaining)}"></div>
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
    number, date, month, employeeId: empId, employeeName: emp?.name || '',
    net: amount, notes, createdAt: Date.now()
  });
  closeModal();
}

/* ===================== RECEIPTS ===================== */
function renderReceipts(c) {
  const from = state.filters.receiptsFrom || '';
  const to = state.filters.receiptsTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.receipts].filter(r => inRange(r.date)).sort((a,b)=>b.createdAt-a.createdAt);

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h2>📨 سندات القبض</h2>
        <div class="page-subtitle">سندات استلام المبالغ من العملاء</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <label style="font-size:13px;font-weight:700;">من:</label>
        <input type="date" class="search-input" value="${from}" onchange="state.filters.receiptsFrom=this.value;renderSection()">
        <label style="font-size:13px;font-weight:700;">إلى:</label>
        <input type="date" class="search-input" value="${to}" onchange="state.filters.receiptsTo=this.value;renderSection()">
        ${from || to ? `<button class="btn btn-secondary btn-sm" onclick="state.filters.receiptsFrom='';state.filters.receiptsTo='';renderSection()">إعادة تعيين</button>` : ''}
      </div>
      <div class="toolbar-right">
        ${list.length ? `
          <button class="btn btn-secondary" onclick="exportReceiptsExcel()">📊 Excel</button>
          <button class="btn btn-secondary" onclick="exportReceiptsPDF('${from}','${to}')">📥 PDF (${list.length})</button>
          <button class="btn btn-secondary" onclick="printReceiptsList()">🖨️</button>
        ` : ''}
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
              <button class="btn btn-secondary btn-sm" onclick="exportReceiptPDF('${r.id}')">📥</button>
              <button class="btn btn-secondary btn-sm" onclick="printReceipt('${r.id}')">🖨️</button>
              <button class="btn btn-danger btn-sm" onclick="softDelete('receipts','${r.id}')">🗑️</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">📨</div><p>لا توجد سندات</p></div>`}
    </div>
  `;
}

function buildReceiptContent(r) {
  return `
    <div class="print-meta">
      <div><strong>الرقم:</strong> ${esc(r.number)}</div>
      <div><strong>التاريخ:</strong> ${esc(r.date)}</div>
      <div><strong>العميل:</strong> ${esc(r.customerName)}</div>
      <div><strong>طريقة الدفع:</strong> ${esc(r.method||'-')}</div>
    </div>
    <div class="voucher-box">
      <p style="margin:0;">
        استلمنا من السيد/ <strong>${esc(r.customerName)}</strong> مبلغ وقدره 
        <strong>${fmt(r.amount)}</strong> ${r.method ? `(${esc(r.method)})` : ''}.
      </p>
      ${r.notes ? `<p><strong>ملاحظات:</strong> ${esc(r.notes)}</p>` : ''}
    </div>
    <div class="signatures">
      <div>توقيع المستلم: ________________</div>
      <div>توقيع الدافع: ________________</div>
    </div>
  `;
}

function exportReceiptPDF(id) {
  const r = state.data.receipts.find(x => x.id === id);
  if (!r) return;
  exportPDF('سند قبض — ' + r.number, buildReceiptContent(r), 'Receipt_' + r.number);
}

function exportReceiptsPDF(from, to) {
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.receipts].filter(r => inRange(r.date)).sort((a,b)=>b.createdAt-a.createdAt);
  if (!list.length) { alert('لا توجد سندات للتصدير'); return; }
  const total = list.reduce((s,x)=>s+(Number(x.amount)||0),0);
  const period = from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : 'كل الفترات';
  const content = `
    <div class="print-meta">
      <div><strong>الفترة:</strong> ${esc(period)}</div>
      <div><strong>عدد السندات:</strong> ${list.length}</div>
    </div>
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
  `;
  exportPDF('تقرير سندات القبض — ' + period, content, 'receipts_report');
}

function printReceipt(id) {
  const r = state.data.receipts.find(x => x.id === id);
  if (!r) return;
  printHtml(printHeaderHtml('سند قبض') + buildReceiptContent(r) + printFooterHtml());
}

function printReceiptsList() {
  const from = state.filters.receiptsFrom || '';
  const to = state.filters.receiptsTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.receipts].filter(r => inRange(r.date)).sort((a,b)=>b.createdAt-a.createdAt);
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
        <label>العميل *</label>
        <input list="customersListR" id="rCust" placeholder="اكتب أو اختر..." autocomplete="off">
        <datalist id="customersListR">
          ${state.data.customers.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}
        </datalist>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>المبلغ *</label><input type="text" inputmode="decimal" id="rAmount" value="0"></div>
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
  const from = state.filters.paymentsFrom || '';
  const to = state.filters.paymentsTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.payments].filter(p => inRange(p.date)).sort((a,b)=>b.createdAt-a.createdAt);

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h2>📤 سندات الصرف</h2>
        <div class="page-subtitle">سندات صرف المبالغ للمستفيدين</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <label style="font-size:13px;font-weight:700;">من:</label>
        <input type="date" class="search-input" value="${from}" onchange="state.filters.paymentsFrom=this.value;renderSection()">
        <label style="font-size:13px;font-weight:700;">إلى:</label>
        <input type="date" class="search-input" value="${to}" onchange="state.filters.paymentsTo=this.value;renderSection()">
        ${from || to ? `<button class="btn btn-secondary btn-sm" onclick="state.filters.paymentsFrom='';state.filters.paymentsTo='';renderSection()">إعادة تعيين</button>` : ''}
      </div>
      <div class="toolbar-right">
        ${list.length ? `
          <button class="btn btn-secondary" onclick="exportPaymentsExcel()">📊 Excel</button>
          <button class="btn btn-secondary" onclick="exportPaymentsPDF('${from}','${to}')">📥 PDF (${list.length})</button>
          <button class="btn btn-secondary" onclick="printPaymentsList()">🖨️</button>
        ` : ''}
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
              <button class="btn btn-secondary btn-sm" onclick="exportPaymentPDF('${p.id}')">📥</button>
              <button class="btn btn-secondary btn-sm" onclick="printPayment('${p.id}')">🖨️</button>
              <button class="btn btn-danger btn-sm" onclick="softDelete('payments','${p.id}')">🗑️</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty-state"><div class="icon">📤</div><p>لا توجد سندات صرف</p></div>`}
    </div>
  `;
}

function buildPaymentContent(p) {
  return `
    <div class="print-meta">
      <div><strong>الرقم:</strong> ${esc(p.number)}</div>
      <div><strong>التاريخ:</strong> ${esc(p.date)}</div>
      <div><strong>المستفيد:</strong> ${esc(p.beneficiary)}</div>
      <div><strong>طريقة الدفع:</strong> ${esc(p.method||'-')}</div>
    </div>
    <div class="voucher-box">
      <p style="margin:0;">
        تم صرف مبلغ وقدره <strong>${fmt(p.amount)}</strong> ${p.method ? `(${esc(p.method)})` : ''}
        إلى السيد/ <strong>${esc(p.beneficiary)}</strong>.
      </p>
      ${p.notes ? `<p><strong>ملاحظات:</strong> ${esc(p.notes)}</p>` : ''}
    </div>
    <div class="signatures">
      <div>توقيع المستلم: ________________</div>
      <div>توقيع المسؤول: ________________</div>
    </div>
  `;
}

function exportPaymentPDF(id) {
  const p = state.data.payments.find(x => x.id === id);
  if (!p) return;
  exportPDF('سند صرف — ' + p.number, buildPaymentContent(p), 'Payment_' + p.number);
}

function exportPaymentsPDF(from, to) {
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.payments].filter(p => inRange(p.date)).sort((a,b)=>b.createdAt-a.createdAt);
  if (!list.length) { alert('لا توجد سندات للتصدير'); return; }
  const total = list.reduce((s,x)=>s+(Number(x.amount)||0),0);
  const period = from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : 'كل الفترات';
  const content = `
    <div class="print-meta">
      <div><strong>الفترة:</strong> ${esc(period)}</div>
      <div><strong>عدد السندات:</strong> ${list.length}</div>
    </div>
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
  `;
  exportPDF('تقرير سندات الصرف — ' + period, content, 'payments_report');
}

function printPayment(id) {
  const p = state.data.payments.find(x => x.id === id);
  if (!p) return;
  printHtml(printHeaderHtml('سند صرف') + buildPaymentContent(p) + printFooterHtml());
}

function printPaymentsList() {
  const from = state.filters.paymentsFrom || '';
  const to = state.filters.paymentsTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);
  const list = [...state.data.payments].filter(p => inRange(p.date)).sort((a,b)=>b.createdAt-a.createdAt);
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
        <label>المستفيد *</label>
        <input list="customersListPay" id="payBen" placeholder="اكتب أو اختر..." autocomplete="off">
        <datalist id="customersListPay">
          ${state.data.customers.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}
        </datalist>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>المبلغ *</label><input type="text" inputmode="decimal" id="payAmount" value="0"></div>
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
    number, date, partyId, beneficiary: name, amount,
    method, notes, createdAt: Date.now()
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
  const journal = state.data.journal.filter(j => inRange(j.date));
  const sum = (arr, k) => arr.reduce((s, x) => s + (Number(x[k]) || 0), 0);

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h2>📈 التقارير</h2>
        <div class="page-subtitle">تقارير شاملة عن أداء المؤسسة</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <label style="font-size:13px;font-weight:700;">من:</label>
        <input type="date" class="search-input" value="${from}" onchange="state.filters.repFrom=this.value;renderSection()">
        <label style="font-size:13px;font-weight:700;">إلى:</label>
        <input type="date" class="search-input" value="${to}" onchange="state.filters.repTo=this.value;renderSection()">
      </div>
      <div class="toolbar-right">
        <button class="btn btn-secondary" onclick="state.filters.repFrom='';state.filters.repTo='';renderSection()">إعادة تعيين</button>
        <button class="btn btn-primary" onclick="exportFullReportPDF()">📥 PDF</button>
        <button class="btn btn-secondary" onclick="printFullReport()">🖨️</button>
      </div>
    </div>

    <div class="stats-grid stats-grid-4">
      <div class="stat-card">
        <div class="stat-icon green">🧾</div>
        <div class="stat-body">
          <div class="stat-label">المبيعات (${sales.length})</div>
          <div class="stat-value small">${fmt(sum(sales,'total'))}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">📥</div>
        <div class="stat-body">
          <div class="stat-label">المشتريات (${purchases.length})</div>
          <div class="stat-value small">${fmt(sum(purchases,'total'))}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red">📤</div>
        <div class="stat-body">
          <div class="stat-label">المصروفات (${payments.length})</div>
          <div class="stat-value small">${fmt(sum(payments,'amount'))}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">📨</div>
        <div class="stat-body">
          <div class="stat-label">المقبوضات (${receipts.length})</div>
          <div class="stat-value small">${fmt(sum(receipts,'amount'))}</div>
        </div>
      </div>
    </div>

    <div class="stats-grid stats-grid-4">
      <div class="stat-card">
        <div class="stat-icon purple">💵</div>
        <div class="stat-body">
          <div class="stat-label">السلف (${advances.length})</div>
          <div class="stat-value small">${fmt(sum(advances,'amount'))}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon primary">💼</div>
        <div class="stat-body">
          <div class="stat-label">الرواتب (${salaries.length})</div>
          <div class="stat-value small">${fmt(sum(salaries,'net'))}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">📔</div>
        <div class="stat-body">
          <div class="stat-label">القيود (${journal.length})</div>
          <div class="stat-value small">${fmt(sum(journal,'amount'))}</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon orange">👥</div>
        <div class="stat-body">
          <div class="stat-label">العملاء والموردون</div>
          <div class="stat-value">${state.data.customers.length}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>👥 أرصدة العملاء والموردين</h3>
      </div>
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
  `;
}

function exportFullReportPDF() {
  const from = state.filters.repFrom || '';
  const to = state.filters.repTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);

  const sales = state.data.sales.filter(s => inRange(s.date));
  const purchases = state.data.purchases.filter(p => inRange(p.date));
  const receipts = state.data.receipts.filter(r => inRange(r.date));
  const payments = state.data.payments.filter(p => inRange(p.date));
  const journal = state.data.journal.filter(j => inRange(j.date));
  const quotations = state.data.quotations.filter(q => inRange(q.date));
  const sum = (arr, k) => arr.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const period = from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : 'كل الفترات';

  const content = `
    <h3 style="margin:15px 0 8px;border-bottom:2px solid #333;padding-bottom:5px;font-size:14px;">ملخص عام</h3>
    <table>
      <tr><td><strong>عدد فواتير البيع:</strong></td><td>${sales.length}</td>
          <td><strong>إجمالي المبيعات:</strong></td><td>${fmt(sum(sales,'total'))}</td></tr>
      <tr><td><strong>عدد فواتير الشراء:</strong></td><td>${purchases.length}</td>
          <td><strong>إجمالي المشتريات:</strong></td><td>${fmt(sum(purchases,'total'))}</td></tr>
      <tr><td><strong>سندات القبض:</strong></td><td>${receipts.length}</td>
          <td><strong>إجمالي المقبوضات:</strong></td><td>${fmt(sum(receipts,'amount'))}</td></tr>
      <tr><td><strong>سندات الصرف:</strong></td><td>${payments.length}</td>
          <td><strong>إجمالي المصروفات:</strong></td><td>${fmt(sum(payments,'amount'))}</td></tr>
      <tr><td><strong>القيود اليومية:</strong></td><td>${journal.length}</td>
          <td><strong>إجمالي القيود:</strong></td><td>${fmt(sum(journal,'amount'))}</td></tr>
      <tr><td><strong>عروض الأسعار:</strong></td><td>${quotations.length}</td>
          <td><strong>إجمالي العروض:</strong></td><td>${fmt(sum(quotations,'total'))}</td></tr>
    </table>
    <h3 style="margin:15px 0 8px;border-bottom:2px solid #333;padding-bottom:5px;font-size:14px;">تفاصيل المبيعات</h3>
    <table>
      <thead><tr><th>#</th><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
      <tbody>${sales.map((s,i)=>`<tr>
        <td>${i+1}</td><td>${esc(s.number)}</td><td>${esc(s.date)}</td>
        <td>${esc(s.customerName)}</td><td>${fmt(s.total)}</td>
        <td>${fmt(s.paid)}</td><td>${fmt(s.remaining)}</td></tr>`).join('')}</tbody>
    </table>
    <h3 style="margin:15px 0 8px;border-bottom:2px solid #333;padding-bottom:5px;font-size:14px;">أرصدة العملاء والموردين</h3>
    <table>
      <thead><tr><th>#</th><th>الاسم</th><th>الهاتف</th><th>الرصيد</th><th>الحالة</th></tr></thead>
      <tbody>${state.data.customers.map((cu,i) => {
        const bal = customerBalance(cu.id);
        const label = bal > 0 ? 'مدين لنا' : bal < 0 ? 'دائن (لنا عنده)' : 'متعادل';
        return `<tr><td>${i+1}</td><td>${esc(cu.name)}</td><td>${esc(cu.phone||'-')}</td>
          <td>${fmt(Math.abs(bal))}</td><td>${label}</td></tr>`;
      }).join('')}</tbody>
    </table>
  `;
  exportPDF('التقرير الكامل — ' + period, content, 'full_report');
}

function printFullReport() {
  const from = state.filters.repFrom || '';
  const to = state.filters.repTo || '';
  const inRange = d => (!from || d >= from) && (!to || d <= to);

  const sales = state.data.sales.filter(s => inRange(s.date));
  const purchases = state.data.purchases.filter(p => inRange(p.date));
  const receipts = state.data.receipts.filter(r => inRange(r.date));
  const payments = state.data.payments.filter(p => inRange(p.date));
  const journal = state.data.journal.filter(j => inRange(j.date));
  const quotations = state.data.quotations.filter(q => inRange(q.date));
  const sum = (arr, k) => arr.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const period = from || to ? `من ${from || 'البداية'} إلى ${to || 'اليوم'}` : 'كل الفترات';

  const html = `
    ${printHeaderHtml('التقرير الكامل - ' + period)}
    <h3 style="margin:20px 0 10px;border-bottom:2px solid #333;padding-bottom:6px;">ملخص عام</h3>
    <table>
      <tr><td><strong>عدد فواتير البيع:</strong></td><td>${sales.length}</td>
          <td><strong>إجمالي المبيعات:</strong></td><td>${fmt(sum(sales,'total'))}</td></tr>
      <tr><td><strong>عدد فواتير الشراء:</strong></td><td>${purchases.length}</td>
          <td><strong>إجمالي المشتريات:</strong></td><td>${fmt(sum(purchases,'total'))}</td></tr>
      <tr><td><strong>سندات القبض:</strong></td><td>${receipts.length}</td>
          <td><strong>إجمالي المقبوضات:</strong></td><td>${fmt(sum(receipts,'amount'))}</td></tr>
      <tr><td><strong>سندات الصرف:</strong></td><td>${payments.length}</td>
          <td><strong>إجمالي المصروفات:</strong></td><td>${fmt(sum(payments,'amount'))}</td></tr>
      <tr><td><strong>القيود اليومية:</strong></td><td>${journal.length}</td>
          <td><strong>إجمالي القيود:</strong></td><td>${fmt(sum(journal,'amount'))}</td></tr>
      <tr><td><strong>عروض الأسعار:</strong></td><td>${quotations.length}</td>
          <td><strong>إجمالي العروض:</strong></td><td>${fmt(sum(quotations,'total'))}</td></tr>
    </table>
    <h3 style="margin:20px 0 10px;border-bottom:2px solid #333;padding-bottom:6px;">تفاصيل المبيعات</h3>
    <table>
      <thead><tr><th>#</th><th>الرقم</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
      <tbody>${sales.map((s,i)=>`<tr>
        <td>${i+1}</td><td>${esc(s.number)}</td><td>${esc(s.date)}</td>
        <td>${esc(s.customerName)}</td><td>${fmt(s.total)}</td>
        <td>${fmt(s.paid)}</td><td>${fmt(s.remaining)}</td></tr>`).join('')}</tbody>
    </table>
    <h3 style="margin:20px 0 10px;border-bottom:2px solid #333;padding-bottom:6px;">أرصدة العملاء والموردين</h3>
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
  const phonesList = (Array.isArray(s.phones) && s.phones.length) ? s.phones : [''];

  c.innerHTML = `
    <div class="page-header">
      <div>
        <h2>⚙️ الإعدادات</h2>
        <div class="page-subtitle">إعدادات المؤسسة والشعار</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h3>🏢 بيانات المؤسسة</h3></div>
      <div class="form-row">
        <div class="form-group"><label>اسم المؤسسة</label>
          <input id="setName" placeholder="اكتب اسم المؤسسة" value="${esc(s.businessName||'')}"></div>
        <div class="form-group"><label>العنوان</label>
          <input id="setAddress" placeholder="اكتب العنوان" value="${esc(s.address||'')}"></div>
      </div>

      <div class="form-group">
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>أرقام الهاتف</span>
          <button type="button" class="btn btn-secondary btn-sm" onclick="addPhoneField()">+ إضافة رقم</button>
        </label>
        <div id="phonesContainer">
          ${phonesList.map((ph) => `
            <div class="phone-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
              <input type="tel" class="phone-input" placeholder="أدخل رقم الهاتف" value="${esc(ph||'')}">
              <button type="button" class="btn btn-danger btn-sm" onclick="removePhoneField(this)" title="حذف">×</button>
            </div>
          `).join('')}
        </div>
        <small style="color:var(--muted);font-size:12px;">يمكنك إضافة أي عدد من الأرقام — تظهر جميعها في الفواتير</small>
      </div>

      <div class="form-group"><label>نص التذييل</label>
        <input id="setFooter" placeholder="مثال: شكراً لتعاملكم معنا" value="${esc(s.footer||'')}"></div>

      <div class="form-group">
        <label>الشعار (Logo) — يتم استخراج الألوان تلقائيًا وتطبيقها على كل النظام</label>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
          <div style="width:120px;height:120px;border:2px dashed var(--accent);border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--primary-soft);overflow:hidden;">
            ${s.logo 
              ? `<img src="${s.logo}" style="width:100%;height:100%;object-fit:contain;">` 
              : `<span style="color:var(--muted);font-size:12px;">لا يوجد شعار</span>`}
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <input type="file" id="logoFile" accept="image/*" style="display:none;" onchange="handleLogoUpload(event)">
            <button class="btn btn-primary" onclick="document.getElementById('logoFile').click()">📁 رفع شعار</button>
            ${s.logo ? `<button class="btn btn-danger" onclick="removeLogo()">🗑️ حذف الشعار</button>` : ''}
            <small style="color:var(--muted);font-size:12px;">PNG شفافة، أقل من 500KB</small>
          </div>
        </div>

        ${s.themePrimary && s.themeSecondary ? `
          <div style="margin-top:16px;padding:14px;background:var(--bg);border-radius:12px;border:1px solid var(--border);">
            <div style="font-size:12px;font-weight:700;color:var(--primary);margin-bottom:10px;">🎨 الألوان المستخرجة من الشعار:</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:8px;background:#fff;padding:8px 14px;border-radius:8px;border:1px solid var(--border);">
                <div style="width:24px;height:24px;border-radius:6px;background:${rgbToHex(s.themePrimary)};box-shadow:0 2px 6px rgba(0,0,0,0.15);"></div>
                <span style="font-size:12px;font-weight:700;">أساسي</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;background:#fff;padding:8px 14px;border-radius:8px;border:1px solid var(--border);">
                <div style="width:24px;height:24px;border-radius:6px;background:${rgbToHex(s.themeSecondary)};box-shadow:0 2px 6px rgba(0,0,0,0.15);"></div>
                <span style="font-size:12px;font-weight:700;">ثانوي</span>
              </div>
            </div>
          </div>
        ` : ''}
      </div>

      <div class="form-actions">
        <button class="btn btn-secondary" onclick="resetSettings()">مسح البيانات</button>
        <button class="btn btn-primary" onclick="saveSettings()">💾 حفظ الإعدادات</button>
      </div>
    </div>
  `;
}

function addPhoneField() {
  const container = document.getElementById('phonesContainer');
  const row = document.createElement('div');
  row.className = 'phone-row';
  row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
  row.innerHTML = `
    <input type="tel" class="phone-input" placeholder="أدخل رقم الهاتف" value="">
    <button type="button" class="btn btn-danger btn-sm" onclick="removePhoneField(this)" title="حذف">×</button>
  `;
  container.appendChild(row);
  row.querySelector('input').focus();
}

function removePhoneField(btn) {
  const rows = document.querySelectorAll('.phone-row');
  if (rows.length > 1) {
    btn.closest('.phone-row').remove();
  } else {
    btn.closest('.phone-row').querySelector('input').value = '';
  }
}

async function saveSettings() {
  const phones = [...document.querySelectorAll('.phone-input')]
    .map(inp => (inp.value || '').trim())
    .filter(Boolean);

  const data = {
    businessName: readStr('#setName'),
    address: readStr('#setAddress'),
    phones: phones,
    footer: readStr('#setFooter'),
    logo: state.settings.logo || '',
    themePrimary: state.settings.themePrimary || null,
    themeSecondary: state.settings.themeSecondary || null,
    updatedAt: Date.now()
  };
  await userCol('settings').doc('business').set(data, { merge: true });
  state.settings = { ...state.settings, ...data };
  const bn = document.getElementById('brandName');
  if (bn) bn.textContent = data.businessName || 'المحاسبة';
  alert('✅ تم حفظ الإعدادات');
  renderSection();
}

async function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 500 * 1024) { alert('⚠️ حجم الصورة كبير (أكبر من 500KB)'); return; }
  if (!file.type.startsWith('image/')) { alert('⚠️ اختر ملف صورة'); return; }

  const reader = new FileReader();
  reader.onload = async e => {
    const base64 = e.target.result;
    const colors = await extractColorsFromLogo(base64);

    state.settings.logo = base64;
    state.settings.themePrimary = colors.primary;
    state.settings.themeSecondary = colors.secondary;

    applyThemeColors(colors.primary, colors.secondary);

    await userCol('settings').doc('business').set({
      logo: base64,
      themePrimary: colors.primary,
      themeSecondary: colors.secondary,
      updatedAt: Date.now()
    }, { merge: true });

    alert('✅ تم رفع الشعار واستخراج الألوان بنجاح');
    renderSection();
  };
  reader.readAsDataURL(file);
}

async function removeLogo() {
  if (!confirm('حذف الشعار والعودة للألوان الافتراضية؟')) return;
  state.settings.logo = '';
  state.settings.themePrimary = null;
  state.settings.themeSecondary = null;
  applyDefaultTheme();
  await userCol('settings').doc('business').set({
    logo: '',
    themePrimary: null,
    themeSecondary: null,
    updatedAt: Date.now()
  }, { merge: true });
  renderSection();
}

async function resetSettings() {
  if (!confirm('مسح بيانات المؤسسة؟ (سيتم الاحتفاظ بالشعار والألوان)')) return;
  const defaultSettings = {
    businessName: '',
    address: '',
    phones: [],
    footer: '',
    logo: state.settings.logo || '',
    themePrimary: state.settings.themePrimary || null,
    themeSecondary: state.settings.themeSecondary || null,
    updatedAt: Date.now()
  };
  await userCol('settings').doc('business').set(defaultSettings, { merge: true });
  state.settings = { ...state.settings, ...defaultSettings };
  const bn = document.getElementById('brandName');
  if (bn) bn.textContent = 'المحاسبة';
  renderSection();
}

/* ===================== Print Helper ===================== */
function printHtml(contentHtml) {
  const s = state.settings;
  const primary = s.themePrimary ? rgbToHex(s.themePrimary) : '#1a3b5c';
  const secondary = s.themeSecondary ? rgbToHex(s.themeSecondary) : '#4a9eff';
  const primaryPale = s.themePrimary ? rgbToHex(adjustColor(s.themePrimary, 94)) : '#eff6ff';
  const secondarySoft = s.themeSecondary ? rgbToHex(adjustColor(s.themeSecondary, 88)) : '#e0f2fe';

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { alert('الرجاء السماح بالنوافذ المنبثقة'); return; }
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
    <title>طباعة</title>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Cairo', sans-serif; padding: 25px; color: #000; direction: rtl; margin: 0; background: #fff; }
      .print-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 16px; border-bottom: 3px double ${primary}; margin-bottom: 20px; }
      .print-logo { height: 90px; width: 90px; object-fit: contain; }
      .print-logo-placeholder { width: 90px; height: 90px; background: ${primary}; color: #fff; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 40px; font-weight: bold; }
      .print-header-info { flex: 1; text-align: left; }
      .print-header-info h1 { margin: 0 0 6px; font-size: 22px; color: ${primary}; }
      .print-header-info p { margin: 2px 0; font-size: 13px; color: #333; }
      .print-doc-title { text-align: center; font-size: 22px; font-weight: bold; background: ${primaryPale}; color: ${primary}; padding: 10px; border-radius: 6px; margin: 20px 0; border: 1px solid ${secondarySoft}; }
      .print-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; margin: 20px 0; padding: 12px; background: #fafafa; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
      th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: right; }
      th { background: ${primaryPale}; color: ${primary}; font-weight: bold; border-bottom: 2px solid ${secondarySoft}; }
      tfoot td { font-weight: bold; }
      .print-totals { margin-top: 20px; padding: 16px; background: #fafafa; border: 1px solid #cbd5e1; border-radius: 6px; display: flex; flex-direction: column; gap: 8px; }
      .print-totals > div { display: flex; justify-content: space-between; }
      .print-totals .grand { border-top: 2px solid ${primary}; padding-top: 10px; margin-top: 6px; font-size: 17px; font-weight: bold; color: ${primary}; }
      .print-notes { margin-top: 15px; padding: 12px; background: #fef3c7; border-right: 4px solid #f59e0b; border-radius: 4px; }
      .print-footer { margin-top: 40px; padding-top: 16px; border-top: 1px dashed #999; text-align: center; font-size: 12px; color: #666; }
      .voucher-box { margin-top: 20px; padding: 20px; border: 1px solid #cbd5e1; background: #fafafa; font-size: 15px; line-height: 2; }
      .signatures { margin-top: 60px; display: flex; justify-content: space-between; font-size: 13px; }
      @media print { body { padding: 0; } }
    </style>
  </head><body>${contentHtml}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 600);
}

/* ============================================================
   🎨 تطبيق الألوان الافتراضية عند التحميل
   ============================================================ */
applyDefaultTheme();