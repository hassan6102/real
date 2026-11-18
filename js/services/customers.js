// خدمات إدارة العملاء، منع تكرار الهاتف، سجل التواصل، والطلبات العقارية (المرحلة 4).
import {
  db, doc, collection, getDoc, getDocs, deleteDoc,
  query, where, orderBy, limit, startAfter, runTransaction, writeBatch, serverTimestamp
} from '../firebase-config.js';
import { normalizePhone, isValidMobile, normalizeAr, toLatinDigits } from '../utils.js';

export const CUSTOMER_TYPES = {
  buyer: 'مشتري',
  tenant: 'مستأجر',
  investor: 'مستثمر',
  seller: 'مالك / بائع',
  other: 'أخرى'
};

export const CUSTOMER_STATUSES = {
  active: 'نشط',
  interested: 'مهتم',
  follow_up: 'يحتاج متابعة',
  closed: 'تم التعاقد',
  inactive: 'غير نشط'
};

export const CUSTOMER_SOURCES = {
  phone_call: 'اتصال هاتفي',
  whatsapp: 'واتساب',
  facebook: 'فيسبوك',
  referral: 'ترشيح / معارف',
  walk_in: 'زيارة للمكتب',
  website: 'موقع إلكتروني',
  other: 'أخرى'
};

export const CONTACT_TYPES = {
  call: 'اتصال هاتفي',
  whatsapp: 'رسالة واتساب',
  visit: 'زيارة بالمكتب',
  viewing: 'معاينة عقار',
  other: 'أخرى'
};

export const CONTACT_OUTCOMES = {
  interested: 'مهتم',
  follow_up: 'طلب متابعة لاحقًا',
  viewing_scheduled: 'تم تحديد موعد معاينة',
  offer_sent: 'تم إرسال عروض',
  no_answer: 'لم يرد',
  busy: 'مشغول',
  not_interested: 'غير مهتم',
  other: 'أخرى'
};

// الحالات الست الأولى تطابق ACTIVE_REQUEST_STATUSES في utils.js و dashboard.js
export const REQUEST_STATUSES = {
  new: 'جديد',
  searching: 'جارٍ البحث',
  found: 'تم توفير عروض',
  offers_sent: 'تم إرسال العروض',
  viewed: 'تمت المعاينة',
  negotiating: 'في مرحلة التفاوض',
  completed: 'تم التنفيذ',
  postponed: 'مؤجل',
  cancelled: 'ملغي'
};

export const PAYMENT_METHODS = {
  cash: 'كاش',
  installment: 'تقسيط',
  both: 'كاش أو تقسيط'
};

export const PRIORITIES = {
  normal: 'عادية',
  high: 'عاجل',
  low: 'غير مستعجل'
};

export const FLOOR_PREFS = {
  any: 'أي دور',
  ground: 'الدور الأرضي',
  low: 'أدوار منخفضة (1 - 3)',
  repeated: 'دور متكرر',
  top: 'الدور الأخير'
};

export const customerRef = id => doc(db, 'customers', id);
export const phoneLockRef = phoneNormalized => doc(db, 'customerPhones', phoneNormalized);
export const requestRef = id => doc(db, 'customerRequests', id);

async function nextCode(counterKey, prefix) {
  const ref = doc(db, 'settings', 'counters');
  try {
    return await runTransaction(db, async t => {
      const snap = await t.get(ref);
      const n = (snap.data()?.[counterKey] || 0) + 1;
      t.set(ref, { [counterKey]: n }, { merge: true });
      return prefix + String(n).padStart(6, '0');
    });
  } catch {
    return prefix + String(Date.now()).slice(-6);
  }
}

function logActivity(batch, user, action, entityType, entityId, entityLabel, extra = {}) {
  batch.set(doc(collection(db, 'activityLogs')), {
    userId: user.uid,
    userName: user.name || '',
    action,
    entityType,
    entityId,
    entityLabel,
    ...extra,
    createdAt: serverTimestamp()
  });
}

const stamp = u => ({
  updatedBy: u.uid,
  updatedByName: u.name || '',
  updatedAt: serverTimestamp()
});

/** التحقق من بيانات العميل وتجهيز الكائن النظيف للحفظ. */
export function validateCustomerInput(raw = {}) {
  const errors = {};
  const name = String(raw.name ?? '').trim();
  const phoneNormalized = normalizePhone(raw.phone ?? '');
  const phone2Raw = String(raw.phone2 ?? '').trim();
  const phone2 = phone2Raw ? normalizePhone(phone2Raw) : '';
  const whatsappRaw = String(raw.whatsapp ?? '').trim();
  const whatsapp = whatsappRaw ? normalizePhone(whatsappRaw) : '';

  if (!name) errors.name = 'اسم العميل مطلوب.';
  else if (name.length < 2) errors.name = 'أدخل اسمًا صحيحًا (حرفان على الأقل).';

  if (!phoneNormalized) {
    errors.phone = 'رقم الهاتف الأساسي مطلوب.';
  } else if (!isValidMobile(phoneNormalized)) {
    errors.phone = 'أدخل رقم موبايل مصري صحيح (11 رقمًا يبدأ بـ 010 أو 011 أو 012 أو 015).';
  }

  if (phone2Raw && !isValidMobile(phone2)) {
    errors.phone2 = 'رقم الهاتف الإضافي غير صحيح.';
  }

  if (whatsappRaw && !isValidMobile(whatsapp)) {
    errors.whatsapp = 'رقم الواتساب غير صحيح.';
  }

  const customerType = raw.customerType && CUSTOMER_TYPES[raw.customerType] ? raw.customerType : 'buyer';
  const status = raw.status && CUSTOMER_STATUSES[raw.status] ? raw.status : 'active';
  const source = raw.source && CUSTOMER_SOURCES[raw.source] ? raw.source : '';
  const city = String(raw.city ?? '').trim();
  const notes = String(raw.notes ?? '').trim();

  const data = {
    name,
    nameKey: normalizeAr(name),
    phone: phoneNormalized,
    phoneNormalized,
    customerType,
    status,
    ...(phone2 && { phone2 }),
    ...(whatsapp && { whatsapp }),
    ...(source && { source }),
    ...(city && { city, cityKey: normalizeAr(city) }),
    ...(notes && { notes })
  };

  return { errors, data, phoneNormalized };
}

/** فحص ما إذا كان رقم الهاتف المطبّع مسجلًا مسبقًا في customerPhones. */
export async function checkPhoneExists(phoneNormalized, excludeCustomerId = null) {
  if (!phoneNormalized) return { exists: false };
  const snap = await getDoc(phoneLockRef(phoneNormalized));
  if (!snap.exists()) return { exists: false };
  const d = snap.data() || {};
  if (excludeCustomerId && d.customerId === excludeCustomerId) {
    return { exists: false };
  }
  return {
    exists: true,
    customerId: d.customerId || null,
    customerName: d.customerName || ''
  };
}

/**
 * إنشاء عميل جديد مع منع تكرار رقم الهاتف عبر customerPhones/{phoneNormalized} باستخدام writeBatch.
 */
export async function createCustomer(user, rawInput) {
  const { errors, data, phoneNormalized } = validateCustomerInput(rawInput);
  if (Object.keys(errors).length) {
    const err = new Error(Object.values(errors)[0]);
    err.code = 'VALIDATION_ERROR';
    err.errors = errors;
    throw err;
  }

  // التحقق المسبق من وجود رقم الهاتف في customerPhones
  const phoneCheck = await checkPhoneExists(phoneNormalized);
  if (phoneCheck.exists) {
    const err = new Error(
      phoneCheck.customerName
        ? `رقم الهاتف (${phoneNormalized}) مسجل بالفعل للعميل: ${phoneCheck.customerName}`
        : `رقم الهاتف (${phoneNormalized}) مسجل بالفعل لعميل آخر في النظام.`
    );
    err.code = 'DUPLICATE_PHONE';
    err.existingCustomerId = phoneCheck.customerId;
    throw err;
  }

  const code = await nextCode('customer', 'C-');
  const newCustomerRef = doc(collection(db, 'customers'));
  const lockRef = phoneLockRef(phoneNormalized);

  const batch = writeBatch(db);
  batch.set(newCustomerRef, {
    ...data,
    code,
    createdBy: user.uid,
    createdByName: user.name || '',
    createdAt: serverTimestamp(),
    ...stamp(user)
  });

  // حجز رقم الهاتف في customerPhones/{phoneNormalized} لمنع التكرار
  batch.set(lockRef, {
    customerId: newCustomerRef.id,
    customerName: data.name,
    phone: phoneNormalized,
    createdBy: user.uid,
    createdAt: serverTimestamp()
  });

  logActivity(batch, user, 'customer_create', 'customer', newCustomerRef.id, `${code} - ${data.name}`);

  try {
    await batch.commit();
    return newCustomerRef.id;
  } catch (ex) {
    // في حال حدوث تعارض لحظي (Race condition) ترفضه قواعد Firestore لأن update غير مسموح على customerPhones
    const recheck = await checkPhoneExists(phoneNormalized).catch(() => ({ exists: false }));
    if (recheck.exists) {
      const dupErr = new Error(`رقم الهاتف (${phoneNormalized}) مسجل بالفعل لعميل آخر.`);
      dupErr.code = 'DUPLICATE_PHONE';
      dupErr.existingCustomerId = recheck.customerId;
      throw dupErr;
    }
    throw ex;
  }
}

/**
 * تحديث بيانات عميل حالي مع معالجة تغيير رقم الهاتف بأمان عبر writeBatch.
 */
export async function updateCustomer(user, customerId, oldCustomer, rawInput) {
  const { errors, data, phoneNormalized: newPhone } = validateCustomerInput(rawInput);
  if (Object.keys(errors).length) {
    const err = new Error(Object.values(errors)[0]);
    err.code = 'VALIDATION_ERROR';
    err.errors = errors;
    throw err;
  }

  const oldPhone = oldCustomer?.phoneNormalized || normalizePhone(oldCustomer?.phone || '');
  const phoneChanged = newPhone !== oldPhone;

  if (phoneChanged) {
    const phoneCheck = await checkPhoneExists(newPhone, customerId);
    if (phoneCheck.exists) {
      const err = new Error(
        phoneCheck.customerName
          ? `رقم الهاتف (${newPhone}) مسجل بالفعل للعميل: ${phoneCheck.customerName}`
          : `رقم الهاتف (${newPhone}) مسجل بالفعل لعميل آخر.`
      );
      err.code = 'DUPLICATE_PHONE';
      err.existingCustomerId = phoneCheck.customerId;
      throw err;
    }
  }

  const batch = writeBatch(db);
  const nextDoc = {
    ...data,
    code: oldCustomer.code || 'C-000000',
    createdBy: oldCustomer.createdBy || user.uid,
    createdByName: oldCustomer.createdByName || user.name || '',
    createdAt: oldCustomer.createdAt || serverTimestamp(),
    ...(oldCustomer.lastContactAt && { lastContactAt: oldCustomer.lastContactAt }),
    ...(oldCustomer.lastContactType && { lastContactType: oldCustomer.lastContactType }),
    ...(oldCustomer.lastContactOutcome && { lastContactOutcome: oldCustomer.lastContactOutcome }),
    ...stamp(user)
  };

  batch.set(customerRef(customerId), nextDoc);

  // ملاحظة مهمة: قواعد Firestore تمنع update على customerPhones وتسمح بـ create و delete فقط
  if (phoneChanged) {
    if (oldPhone) batch.delete(phoneLockRef(oldPhone));
    batch.set(phoneLockRef(newPhone), {
      customerId,
      customerName: data.name,
      phone: newPhone,
      createdBy: user.uid,
      createdAt: serverTimestamp()
    });
  }

  logActivity(batch, user, 'customer_update', 'customer', customerId, `${nextDoc.code} - ${data.name}`);
  await batch.commit();
}

/** حذف عميل وتحرير رقم الهاتف من customerPhones (للمدير فقط). */
export async function deleteCustomer(customer) {
  const batch = writeBatch(db);
  const phone = customer.phoneNormalized || normalizePhone(customer.phone || '');
  if (phone) batch.delete(phoneLockRef(phone));
  batch.delete(customerRef(customer.id));
  await batch.commit();
}

/** جلب عميل واحد بواسطة المعرّف. */
export async function getCustomer(customerId) {
  if (!customerId) return null;
  const snap = await getDoc(customerRef(customerId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/** بناء استعلام قائمة العملاء مع Pagination (مرتب بالأحدث إضافة). */
export function customersListQuery(pageSize = 20, after = null) {
  const constraints = [orderBy('createdAt', 'desc')];
  if (after) constraints.push(startAfter(after));
  constraints.push(limit(pageSize));
  return query(collection(db, 'customers'), ...constraints);
}

/** جلب دفعة من العملاء مع مؤشر الصفحة التالية. */
export async function getCustomersPage(pageSize = 20, after = null) {
  const snap = await getDocs(customersListQuery(pageSize, after));
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return {
    docs: snap.docs,
    items,
    lastDoc: snap.docs.at(-1) || null,
    hasMore: snap.size === pageSize
  };
}

/** فلترة سريعة للعميل في المتصفح (بالاسم، الهاتف، الكود، المدينة، الملاحظات، التصنيف، الحالة). */
export function matchCustomerSearch(c, searchQuery = '', typeFilter = '', statusFilter = '') {
  if (typeFilter && c.customerType !== typeFilter) return false;
  if (statusFilter && c.status !== statusFilter) return false;
  const q = String(searchQuery || '').trim();
  if (!q) return true;

  const qAr = normalizeAr(q);
  const qDigits = toLatinDigits(q).replace(/\D/g, '');

  const haystack = [
    c.name,
    c.code,
    c.city,
    c.notes,
    CUSTOMER_TYPES[c.customerType],
    CUSTOMER_SOURCES[c.source]
  ].map(x => normalizeAr(x || '')).join(' ');

  if (haystack.includes(qAr)) return true;
  if (qDigits && (
    String(c.phone || '').includes(qDigits) ||
    String(c.phoneNormalized || '').includes(qDigits) ||
    String(c.phone2 || '').includes(qDigits) ||
    String(c.whatsapp || '').includes(qDigits)
  )) return true;

  return false;
}

/* =========================================================================
   سجل التواصل مع العميل: customers/{id}/contacts/{cid}
   ========================================================================= */

/** إضافة سجل تواصل جديد مع العميل وتحديث تاريخ آخر تواصل في مستند العميل. */
export async function addCustomerContact(user, customerId, contactInput = {}) {
  const type = contactInput.type && CONTACT_TYPES[contactInput.type] ? contactInput.type : 'call';
  const outcome = contactInput.outcome && CONTACT_OUTCOMES[contactInput.outcome] ? contactInput.outcome : 'interested';
  const contactDate = String(contactInput.contactDate || new Date().toISOString().slice(0, 10)).trim();
  const nextFollowUpDate = String(contactInput.nextFollowUpDate || '').trim() || null;
  const notes = String(contactInput.notes ?? '').trim();

  if (!notes) {
    const err = new Error('يرجى كتابة ملخص أو نتيجة التواصل.');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const contactDocRef = doc(collection(db, 'customers', customerId, 'contacts'));
  const batch = writeBatch(db);

  batch.set(contactDocRef, {
    type,
    contactDate,
    outcome,
    ...(nextFollowUpDate && { nextFollowUpDate }),
    notes,
    createdBy: user.uid,
    createdByName: user.name || '',
    createdAt: serverTimestamp()
  });

  batch.update(customerRef(customerId), {
    lastContactAt: serverTimestamp(),
    lastContactDate: contactDate,
    lastContactType: type,
    lastContactOutcome: outcome,
    ...stamp(user)
  });

  await batch.commit();
  return contactDocRef.id;
}

/** جلب سجل التواصل الخاص بالعميل مرتبًا من الأحدث للأقدم. */
export async function getCustomerContacts(customerId) {
  const q = query(collection(db, 'customers', customerId, 'contacts'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** حذف سجل تواصل (للمدير فقط). */
export async function deleteCustomerContact(customerId, contactId) {
  await deleteDoc(doc(db, 'customers', customerId, 'contacts', contactId));
}

/* =========================================================================
   طلبات العميل العقارية: customerRequests/{id} ومتابعاتها followUps/{fid}
   ========================================================================= */

function parsePositiveNum(val) {
  const s = toLatinDigits(String(val ?? '')).replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

/** التحقق من مدخلات الطلب العقاري وتجهيز المستند. */
export function validateRequestInput(raw = {}) {
  const errors = {};
  const transactionType = String(raw.transactionType ?? '').trim();
  const propertyType = String(raw.propertyType ?? '').trim();

  if (!transactionType) errors.transactionType = 'اختر نوع العملية المطلوبة.';
  if (!propertyType) errors.propertyType = 'اختر نوع العقار المطلوب.';

  const budgetMin = parsePositiveNum(raw.budgetMin);
  const budgetMax = parsePositiveNum(raw.budgetMax);
  const areaMin = parsePositiveNum(raw.areaMin);
  const areaMax = parsePositiveNum(raw.areaMax);
  const roomsMin = parsePositiveNum(raw.roomsMin);
  const bathroomsMin = parsePositiveNum(raw.bathroomsMin);

  if (Number.isNaN(budgetMin)) errors.budgetMin = 'أدخل رقمًا صحيحًا.';
  if (Number.isNaN(budgetMax)) errors.budgetMax = 'أدخل رقمًا صحيحًا.';
  if (budgetMin != null && budgetMax != null && budgetMax < budgetMin) {
    errors.budgetMax = 'الحد الأقصى للميزانية يجب أن يكون أكبر من أو يساوي الحد الأدنى.';
  }

  if (Number.isNaN(areaMin)) errors.areaMin = 'أدخل رقمًا صحيحًا.';
  if (Number.isNaN(areaMax)) errors.areaMax = 'أدخل رقمًا صحيحًا.';
  if (areaMin != null && areaMax != null && areaMax < areaMin) {
    errors.areaMax = 'المساحة القصوى يجب أن تكون أكبر من أو تساوي المساحة الدنيا.';
  }

  if (Number.isNaN(roomsMin)) errors.roomsMin = 'أدخل رقمًا صحيحًا.';
  if (Number.isNaN(bathroomsMin)) errors.bathroomsMin = 'أدخل رقمًا صحيحًا.';

  const status = raw.status && REQUEST_STATUSES[raw.status] ? raw.status : 'new';
  const city = String(raw.city ?? '').trim();
  const districts = String(raw.districts ?? '').trim();
  const finishing = String(raw.finishing ?? '').trim();
  const floorPref = raw.floorPref && FLOOR_PREFS[raw.floorPref] ? raw.floorPref : 'any';
  const paymentMethod = raw.paymentMethod && PAYMENT_METHODS[raw.paymentMethod] ? raw.paymentMethod : 'cash';
  const priority = raw.priority && PRIORITIES[raw.priority] ? raw.priority : 'normal';
  const notes = String(raw.notes ?? '').trim();

  const data = {
    transactionType,
    propertyType,
    status,
    floorPref,
    paymentMethod,
    priority,
    ...(city && { city, cityKey: normalizeAr(city) }),
    ...(districts && { districts }),
    ...(budgetMin != null && !Number.isNaN(budgetMin) && { budgetMin }),
    ...(budgetMax != null && !Number.isNaN(budgetMax) && { budgetMax }),
    ...(areaMin != null && !Number.isNaN(areaMin) && { areaMin }),
    ...(areaMax != null && !Number.isNaN(areaMax) && { areaMax }),
    ...(roomsMin != null && !Number.isNaN(roomsMin) && { roomsMin }),
    ...(bathroomsMin != null && !Number.isNaN(bathroomsMin) && { bathroomsMin }),
    ...(finishing && { finishing }),
    ...(notes && { notes })
  };

  return { errors, data };
}

/** إضافة طلب عقاري جديد لعميل عبر writeBatch. */
export async function createCustomerRequest(user, customer, rawInput) {
  const { errors, data } = validateRequestInput(rawInput);
  if (Object.keys(errors).length) {
    const err = new Error(Object.values(errors)[0]);
    err.code = 'VALIDATION_ERROR';
    err.errors = errors;
    throw err;
  }

  const code = await nextCode('request', 'R-');
  const newReqRef = doc(collection(db, 'customerRequests'));
  const batch = writeBatch(db);

  batch.set(newReqRef, {
    ...data,
    code,
    customerId: customer.id,
    customerName: customer.name || '',
    customerPhone: customer.phoneNormalized || customer.phone || '',
    createdBy: user.uid,
    createdByName: user.name || '',
    createdAt: serverTimestamp(),
    ...stamp(user)
  });

  logActivity(batch, user, 'request_create', 'request', newReqRef.id, `${code} (${customer.name || ''})`);
  await batch.commit();
  return newReqRef.id;
}

/** تغيير حالة طلب عقاري عبر writeBatch. */
export async function updateRequestStatus(user, req, newStatus) {
  if (!REQUEST_STATUSES[newStatus]) throw new Error('حالة الطلب غير صالحة.');
  const batch = writeBatch(db);
  batch.update(requestRef(req.id), {
    status: newStatus,
    ...stamp(user)
  });
  logActivity(batch, user, 'request_update', 'request', req.id, `${req.code || ''} (${req.customerName || ''})`, {
    from: req.status,
    to: newStatus
  });
  await batch.commit();
}

/** حذف طلب عقاري (للمدير فقط). */
export async function deleteCustomerRequest(requestId) {
  await deleteDoc(requestRef(requestId));
}

/** جلب جميع الطلبات العقارية الخاصة بعميل معين (مع ترتيبها في المتصفح لتجنب الحاجة لفهرس مركب). */
export async function getCustomerRequests(customerId) {
  const q = query(collection(db, 'customerRequests'), where('customerId', '==', customerId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

/** جلب قائمة كافة طلبات العملاء مع Pagination (لصفحة طلبات العملاء العامة). */
export async function getAllRequestsPage(pageSize = 25, after = null) {
  const constraints = [orderBy('createdAt', 'desc')];
  if (after) constraints.push(startAfter(after));
  constraints.push(limit(pageSize));
  const snap = await getDocs(query(collection(db, 'customerRequests'), ...constraints));
  return {
    docs: snap.docs,
    items: snap.docs.map(d => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs.at(-1) || null,
    hasMore: snap.size === pageSize
  };
}

/** إضافة متابعة على طلب عقاري في customerRequests/{id}/followUps/{fid}. */
export async function addRequestFollowUp(user, requestId, followUpInput = {}) {
  const note = String(followUpInput.note ?? '').trim();
  const newStatus = followUpInput.status && REQUEST_STATUSES[followUpInput.status] ? followUpInput.status : null;
  const nextActionDate = String(followUpInput.nextActionDate ?? '').trim() || null;

  if (!note) {
    const err = new Error('يرجى كتابة ملاحظة المتابعة.');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const followUpRef = doc(collection(db, 'customerRequests', requestId, 'followUps'));
  const batch = writeBatch(db);

  batch.set(followUpRef, {
    note,
    ...(newStatus && { status: newStatus }),
    ...(nextActionDate && { nextActionDate }),
    createdBy: user.uid,
    createdByName: user.name || '',
    createdAt: serverTimestamp()
  });

  batch.update(requestRef(requestId), {
    lastFollowUpAt: serverTimestamp(),
    lastFollowUpNote: note,
    ...(newStatus && { status: newStatus }),
    ...stamp(user)
  });

  await batch.commit();
  return followUpRef.id;
}

/** جلب متابعات طلب عقاري معين مرتبة من الأحدث للأقدم. */
export async function getRequestFollowUps(requestId) {
  const q = query(collection(db, 'customerRequests', requestId, 'followUps'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
