// توليد كود العقار الرقمي (1001, 1002, ...). يُستدعى داخل runTransaction فقط: القراءة والزيادة والكتابة ذرّية،
// فإذا تنافس موظفان على نفس الرقم يعيد Firestore تنفيذ المعاملة الخاسرة تلقائيًا فتأخذ رقمًا جديدًا.
// لا Date.now ولا عشوائية. العداد لا ينقص أبدًا، فلا يُعاد استخدام كود عقار محذوف.
export const FIRST_NO = 1001;

/** t: كائن المعاملة، ref: مرجع settings/counters. يعيد الرقم الجديد ويكتب العداد ضمن نفس المعاملة. */
export async function takeNextNo(t, ref) {
  const snap = await t.get(ref);
  const cur = snap.exists() ? snap.data()?.propertyNo : undefined;
  const n = Number.isInteger(cur) && cur >= FIRST_NO - 1 ? cur + 1 : FIRST_NO;
  t.set(ref, { propertyNo: n }, { merge: true });
  return n;
}
