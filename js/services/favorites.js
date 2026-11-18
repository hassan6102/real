// المفضلة: users/{uid}/favorites/{propertyId}. معرّف المستند = معرّف العقار فيستحيل تكراره.
import { db, doc, collection, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, query, orderBy, limit, serverTimestamp } from '../firebase-config.js';

const favCol = uid => collection(db, 'users', uid, 'favorites');
const favRef = (uid, pid) => doc(db, 'users', uid, 'favorites', pid);

/** يضيف العقار إن لم يكن موجودًا (لا يعيد الكتابة فيحفظ تاريخ الإضافة الأصلي). */
export async function addFavorite(user, property) {
  if ((await getDoc(favRef(user.uid, property.id))).exists()) return false;
  await setDoc(favRef(user.uid, property.id), { propertyId: property.id, code: property.code || '', addedAt: serverTimestamp() });
  return true;
}
export const removeFavorite = (user, propertyId) => deleteDoc(favRef(user.uid, propertyId));

/** مراقبة لحظية لمعرّفات المفضلة الخاصة بالمستخدم الحالي فقط. */
export const watchFavoriteIds = (user, cb, onError) =>
  onSnapshot(favCol(user.uid), s => cb(new Set(s.docs.map(d => d.id))), e => { console.error(e); onError?.(e); });

/** قائمة المفضلة مع بيانات العقار الحالية. العقار المحذوف يعود بـ property = null بدل خطأ. */
export async function listFavorites(user, max = 300) {
  const snap = await getDocs(query(favCol(user.uid), orderBy('addedAt', 'desc'), limit(max)));
  return Promise.all(snap.docs.map(async d => {
    let property = null;
    try { const s = await getDoc(doc(db, 'properties', d.id)); if (s.exists()) property = { id: s.id, ...s.data() }; } catch (e) { console.error(e); }
    return { id: d.id, code: d.data().code || '', addedAt: d.data().addedAt, property };
  }));
}
