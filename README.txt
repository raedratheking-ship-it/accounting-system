النظام المحاسبي المتكامل باستخدام HTML/CSS/JavaScript + Firebase
================================================================

المتطلبات:
- حساب Google
- مشروع Firebase (مجاني)

خطوات الإعداد:
--------------
1) أنشئ مشروعًا جديدًا على https://console.firebase.google.com

2) في Authentication:
   - فعّل طريقة تسجيل الدخول "Google"
   - أضف النطاق الخاص بك في Authorized domains

3) في Firestore Database:
   - أنشئ قاعدة بيانات (وضع الإنتاج)
   - الصق قواعد الأمان التالية:

   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }

4) في Project Settings > General > Your apps:
   - أضف تطبيق ويب
   - انسخ قيم firebaseConfig والصقها في ملف firebase-config.js

5) ارفع الملفات إلى أي استضافة (Firebase Hosting، Netlify، Vercel، GitHub Pages...)
   أو افتح index.html مباشرة (مع إضافة localhost إلى Authorized Domains إن لزم).

الملفات:
-------
- index.html           : واجهة التطبيق
- style.css            : التنسيقات
- app.js               : منطق التطبيق
- firebase-config.js   : إعدادات Firebase
- README.txt           : هذا الملف

الميزات:
-------
✅ تسجيل دخول Google - حساب مستقل لكل مستخدم
✅ حفظ سحابي دائم في Firestore (لا LocalStorage)
✅ Soft Delete لكل السجلات
✅ ترقيم تلقائي للفواتير والسندات
✅ حركة مخزون تلقائية مع البيع والشراء
✅ إحصائيات فورية وتقارير شاملة
✅ طباعة الفواتير
✅ واجهة عربية RTL متجاوبة

المجموعات (Collections) في Firestore:
-------------------------------------
users/{uid}/customers   - العملاء
users/{uid}/employees   - الموظفون
users/{uid}/items       - الأصناف
users/{uid}/sales       - فواتير البيع
users/{uid}/purchases   - فواتير الشراء
users/{uid}/receipts    - سندات القبض
users/{uid}/payments    - سندات الصرف
users/{uid}/advances    - سلف الموظفين
users/{uid}/salaries    - الرواتب
users/{uid}/counters    - عدادات الترقيم
