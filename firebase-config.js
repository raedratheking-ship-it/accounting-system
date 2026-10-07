/* =================================================================
   firebase-config.js — النسخة النهائية مع جلسة دائمة
   ================================================================= */

if (typeof firebase === 'undefined') {
  document.body.innerHTML = `
    <div style="font-family:Cairo,sans-serif;direction:rtl;padding:40px;text-align:center;background:#fee2e2;color:#7f1d1d;min-height:100vh;">
      <h1>❌ Firebase SDK لم يتم تحميله</h1>
      <p style="font-size:16px;margin-top:20px;">تحقق من اتصالك بالإنترنت وأعد تحميل الصفحة</p>
    </div>`;
  throw new Error('Firebase SDK not loaded');
}

const firebaseConfig = {
  apiKey: "AIzaSyAiqLJR9b-YCWkyWoqHmxyUx91oxWNssM4",
  authDomain: "accounting-system-ba6e6.firebaseapp.com",
  projectId: "accounting-system-ba6e6",
  storageBucket: "accounting-system-ba6e6.firebasestorage.app",
  messagingSenderId: "968875466611",
  appId: "1:968875466611:web:4ea5dab35c015884236f06",
  measurementId: "G-RNSLEH8Y3E"
};

try {
  firebase.initializeApp(firebaseConfig);
  console.log('✅ Firebase initialized successfully');
} catch (e) {
  console.error('❌ Firebase init error:', e);
  throw e;
}

const auth = firebase.auth();
const db = firebase.firestore();

/* ============================================================
   ✅ الجلسة الدائمة — LOCAL
   المستخدم يبقى مسجلًا حتى بعد إغلاق المتصفح
   ============================================================ */
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .then(() => console.log('✅ Auth persistence: LOCAL (جلسة دائمة)'))
  .catch(err => console.error('❌ Persistence error:', err));

db.enablePersistence({ synchronizeTabs: true })
  .then(() => console.log('✅ Firestore persistence enabled'))
  .catch(err => {
    if (err.code !== 'failed-precondition') console.warn('⚠️ Persistence:', err.code);
  });

console.log('✅ firebase-config.js loaded — auth & db ready');

/* ====== معالج نتيجة الـ Redirect ====== */
auth.getRedirectResult()
  .then(result => {
    if (result && result.user) {
      console.log('✅ تم تسجيل الدخول عبر Redirect:', result.user.email);
    }
  })
  .catch(e => {
    console.error('❌ Redirect result error:', e.code, e.message);
    const errEl = document.getElementById('loginError');
    if (errEl) errEl.textContent = 'فشل تسجيل الدخول: ' + e.message;
  });