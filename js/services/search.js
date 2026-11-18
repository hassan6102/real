import { db, collection, query, where, orderBy, limit, startAfter, getDocs, getCountFromServer, addDoc, deleteDoc, doc, serverTimestamp, Timestamp } from '../firebase-config.js';

const cs = conds => conds.map(([f, op, v]) => where(f, op, v instanceof Date ? Timestamp.fromDate(v) : v));
export const pageFetcher = plan => async (cursor, n) => {
  const q = query(collection(db, 'properties'), ...cs(plan.conds), orderBy(plan.field, plan.dir), ...(cursor ? [startAfter(cursor)] : []), limit(n));
  const s = await getDocs(q);
  return { docs: s.docs, cursor: s.docs.at(-1) };
};
export const exactCount = async plan => (await getCountFromServer(query(collection(db, 'properties'), ...cs(plan.conds)))).data().count;

export const saveSearch = (user, name, filters, sort) => addDoc(collection(db, 'savedSearches'), { userId: user.uid, name, filters, sort, createdAt: serverTimestamp() });
export const listSaved = async user => (await getDocs(query(collection(db, 'savedSearches'), where('userId', '==', user.uid)))).docs
  .map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
export const deleteSaved = id => deleteDoc(doc(db, 'savedSearches', id));
