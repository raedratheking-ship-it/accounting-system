/* =================================================================
   firebase-config.js — النسخة الصحيحة النهائية (Compat SDK فقط)
   ================================================================= */

// 1) التحقق من تحميل Firebase SDK
if (typeof firebase === 'undefined') {
  document.body.innerHTML = `
    <div style="font-family:Cairo,sans-serif;direction:rtl;padding:40px;text-align:center;background:#fee2e2;color:#7f1d1d;min-height:100vh;">
      <h1>❌ Firebase SDK لم يتم تحميله</h1>
      <p style="font-size:18px;margin-top:20px;">تأكد من:</p>
      <ol style="display:inline-block;text-align:right;font-size:16px;line-height:2;">
        <li>اتصالك بالإنترنت</li>
        <li>عدم فتح الملف بـ <code>file://</code> — استخدم خادمًا محليًا</li>
        <li>وجود سكربتات <code>firebase-*-compat.js</code> في index.html</li>
      </ol>
    </div>`;
  throw new Error('Firebase SDK not loaded');
}

// 2) إعدادات مشروعك
const firebaseConfig = {
  apiKey: "AIzaSyAiqLJR9b-YCWkyWoqHmxyUx91oxWNssM4",
  authDomain: "accounting-system-ba6e6.firebaseapp.com",
  projectId: "accounting-system-ba6e6",
  storageBucket: "accounting-system-ba6e6.firebasestorage.app",
  messagingSenderId: "968875466611",
  appId: "1:968875466611:web:4ea5dab35c015884236f06",
  measurementId: "G-RNSLEH8Y3E"
};

// 3) تهيئة Firebase
try {
  firebase.initializeApp(firebaseConfig);
  console.log('✅ Firebase initialized successfully');
} catch (e) {
  console.error('❌ Firebase init error:', e);
  document.body.innerHTML = `
    <div style="font-family:Cairo,sans-serif;direction:rtl;padding:40px;background:#fee2e2;color:#7f1d1d;min-height:100vh;">
      <h1>❌ فشل تهيئة Firebase</h1>
      <pre style="background:#fff;padding:20px;border-radius:8px;margin-top:20px;overflow:auto;">${e.message}</pre>
    </div>`;
  throw e;
}

// 4) تعريف المراجع العامة
const auth = firebase.auth();
const db = firebase.firestore();

// 5) تفعيل العمل بدون إنترنت
db.enablePersistence({ synchronizeTabs: true })
  .then(() => console.log('✅ Firestore persistence enabled'))
  .catch(err => {
    if (err.code !== 'failed-precondition') {
      console.warn('⚠️ Persistence:', err.code);
    }
  });

console.log('✅ firebase-config.js loaded — auth & db ready');