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


---

# المرحلة التطويرية: فصل العقار عن عروض السماسرة

## نموذج البيانات الجديد (متوافق مع القديم)
- `properties/{id}`: الوحدة العقارية. أُضيف: `propertyNo` (كود رقمي ثابت)، `offersSummary` (`activeCount, totalCount, minPrice, maxPrice`)، وأصبح `price` = **أقل عرض نشط** (نسخة مُشتقة لتعمل فلاتر السعر والترتيب خادميًا).
- `properties/{id}/offers/{offerId}`: عام (يقرؤه كل الفريق): `price, status(active|unavailable|expired), sourceKind, propertyId, createdBy/At, updatedBy/At`.
- `properties/{id}/offers/{offerId}/private/data`: خاص بصلاحية `canViewOwnerData`: `brokerName, brokerPhone, brokerPhoneKey, commissionAgreed/Percent/Value/Payer, minPrice, notes` (+ `legacy` للعروض المُرحَّلة).
- رقم الهاتف **غير فريد** ولا يُستعلم عنه ولا يُستخدم لمنع شيء.
- `settings/counters.propertyNo`: عداد الأكواد (1001 فأكثر). القواعد تسمح بزيادته بواحد فقط.
- `migrations/offers_v1`: تقرير الترحيل (مدير فقط).
- حقول `location.governorate/city` القديمة **تبقى في المستندات** ولا تُقرأ ولا تُمسح عند التعديل.

## خطوات النشر (يدويًا، بالترتيب)
1. `firebase deploy --only firestore:rules,firestore:indexes` (فهرس جديد + استثناء حقل `favorites.propertyId` للاستعلام الجماعي). انتظر اكتمال بناء الفهارس.
2. **قبل أي ترحيل:** صدّر Firestore من Console/gcloud (`gcloud firestore export gs://BUCKET/backup`) ونزّل النسخة JSON من صفحة "ترحيل العروض".
3. جرّب كل شيء أولًا على مشروع تجريبي أو Firebase Emulator (`firebase emulators:start --only firestore`).
4. افتح "ترحيل العروض" (مدير) ← نسخة احتياطية ← تجربة بلا كتابة ← تنفيذ. يمكن إعادة التشغيل بأمان.

## الاختبارات
`npm test` (134 اختبارًا محليًا: المحلل، العروض، الترحيل، التكرار، البحث الذكي، محاكاة تنافس الأكواد، فحص الواردات). لا تغطي Firebase الحقيقي ولا القواعد ولا الواجهة في المتصفح.
