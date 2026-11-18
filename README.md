# نظام إدارة العقارات (حتى المرحلة 4)

## الإعداد
1. أنشئ مشروعًا في Firebase Console، ثم فعّل **Authentication > Email/Password** و**Firestore** (وضع الإنتاج).
2. أضف Web app وانسخ الإعدادات إلى `js/firebase-config.js`.
3. أنشئ **المدير الأول** يدويًا:
   - Authentication > Add user (بريد أو `رقم_الهاتف@team.app` + كلمة مرور). انسخ الـ UID.
   - Firestore > مجموعة `users` > مستند بمعرف = الـ UID:
     `name` (string), `role` = `admin`, `status` = `active`, `phone` (string), `permissions` (map: `canViewOwnerData`, `canViewCommissions`, `canViewReports` = true).
4. انشر القواعد: `firebase deploy --only firestore`.
5. شغّل محليًا: `firebase emulators:start` أو `npx serve .` (الوحدات ES تتطلب خادمًا، لا تفتح الملف مباشرة).
6. انشر: `firebase deploy --only hosting`.

## الاختبار
`npm test` يختبر المنطق الخالص (تطبيع الهاتف والنص العربي وغيرها). اختبار الاتصال بـ Firebase والـ Rules يتم على مشروعك أو Emulator.

## الحالة
المرحلة 1: الدخول والحارس ولوحة التحكم والـ Rules. المرحلة 2: العقارات (إضافة وتعديل وتفاصيل وحالة وأرشيف ومشاركة). المرحلة 3: البحث المتقدم الهجين وحفظ الأبحاث. **انشر الفهارس (32 فهرسًا) قبل البحث**: `firebase deploy --only firestore` وقد يستغرق بناؤها دقائق.

- **المرحلة 4**: إدارة العملاء (`customers`)، منع تكرار أرقام الهواتف (`customerPhones`)، سجل التواصل (`contacts`)، والطلبات العقارية ومتابعاتها (`customerRequests` & `followUps`).

- **المرحلة 5 (قيد التنفيذ)**: تم تنفيذ **مطابقة العقارات** (`pages/matching.html`) و**المفضلة** (`pages/favorites.html`).
  - المطابقة تُحسب في المتصفح من بيانات Firestore اللحظية (عقارات `available` وطلبات نشطة، بحد أقصى 500 لكل منهما) فلا توجد نتائج مخزنة قد تتقادم؛ أي إضافة أو تعديل يعيد الحساب تلقائيًا. المنطق في `js/matching-model.js` ومغطى بـ `tests/matching.test.js`.
  - نوع المعاملة ونوع العقار والمدينة شروط استبعاد؛ المنطقة (30) والميزانية (30) والمساحة (20) والغرف (20) تُحسب كنسبة من المعايير المذكورة في الطلب فقط.
  - المفضلة في `users/{uid}/favorites/{propertyId}` (قواعدها موجودة أصلًا وتقصرها على صاحب الحساب). لا تتطلب تغيير القواعد ولا فهارس جديدة.
  - **المتبقي**: التقارير، سجل النشاطات (مع تقييد قراءته بالمدير)، إدارة الفريق (تحتاج Cloud Functions)، الإعدادات.
