import { auth, db, signInWithEmailAndPassword, signOut, doc, getDoc, updateDoc, serverTimestamp } from './firebase-config.js';
import { identifierToEmail } from './utils.js';

const MESSAGES = {
  'auth/invalid-credential': 'بيانات الدخول غير صحيحة. تأكد من الرقم أو البريد وكلمة المرور.',
  'auth/invalid-email': 'صيغة البريد أو رقم الهاتف غير صحيحة.',
  'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.',
  'auth/network-request-failed': 'تعذّر الاتصال بالإنترنت.',
  'auth/user-disabled': 'هذا الحساب موقوف.',
  'inactive': 'هذا الحساب غير مفعّل في الفريق. تواصل مع المدير.'
};
export const authMessage = e => MESSAGES[e?.code] || 'حدث خطأ غير متوقع. حاول مرة أخرى.';

/** يسجل الدخول ثم يتحقق من أن الحساب عضو نشط في الفريق (وإلا يخرجه). */
export async function login(identifier, password) {
  const cred = await signInWithEmailAndPassword(auth, identifierToEmail(identifier), password);
  const snap = await getDoc(doc(db, 'users', cred.user.uid)).catch(() => null);
  if (!snap?.exists() || snap.data().status !== 'active') {
    await signOut(auth);
    throw { code: 'inactive' };
  }
  updateDoc(snap.ref, { lastLoginAt: serverTimestamp() }).catch(() => {});
  return { uid: cred.user.uid, ...snap.data() };
}
export const logout = () => signOut(auth);
