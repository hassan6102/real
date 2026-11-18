import { db, doc, collection, getDoc, getDocs, setDoc, query, where, orderBy, limit, startAfter,
  runTransaction, writeBatch, serverTimestamp } from '../firebase-config.js';
import { listFilters, archiveFor, diffKeys, flatten } from '../property-model.js';

const PRESERVE = ['code', 'createdBy', 'createdByName', 'createdAt', 'originalPrice', 'status', 'isArchived', 'statusChangedAt', 'statusChangedBy', 'statusChangedByName', 'closedAt'];
export const propRef = id => doc(db, 'properties', id);
const privRef = id => doc(db, 'properties', id, 'private', 'data');

async function nextCode() {
  const ref = doc(db, 'settings', 'counters');
  return runTransaction(db, async t => {
    const n = ((await t.get(ref)).data()?.property || 0) + 1;
    t.set(ref, { property: n }, { merge: true });
    return 'P-' + String(n).padStart(6, '0');
  });
}

function log(batch, user, action, id, label, extra = {}) {
  batch.set(doc(collection(db, 'activityLogs')), { userId: user.uid, userName: user.name || '', action, entityType: 'property', entityId: id, entityLabel: label, ...extra, createdAt: serverTimestamp() });
}
const stamp = u => ({ updatedBy: u.uid, updatedByName: u.name || '', updatedAt: serverTimestamp() });

export async function getProperty(id, withPrivate) {
  const s = await getDoc(propRef(id));
  if (!s.exists()) return null;
  let priv = null;
  if (withPrivate) priv = (await getDoc(privRef(id)).catch(() => null))?.data() || {};
  return { id, ...s.data(), _priv: priv };
}

export async function createProperty(user, pub, priv) {
  const code = await nextCode();
  const ref = doc(collection(db, 'properties'));
  const status = pub.status || 'available';
  const b = writeBatch(db);
  b.set(ref, { ...pub, code, status, isArchived: archiveFor(status), ...(pub.price != null && { originalPrice: pub.price }),
    createdBy: user.uid, createdByName: user.name || '', createdAt: serverTimestamp(), ...stamp(user) });
  if (Object.keys(priv).length) b.set(privRef(ref.id), priv);
  log(b, user, 'property_create', ref.id, code);
  await b.commit();
  return ref.id;
}

export async function updateProperty(user, old, pub, priv, canOwner) {
  const next = { ...pub, ...stamp(user) };
  PRESERVE.forEach(k => { if (old[k] !== undefined) next[k] = old[k]; });
  next.status = old.status;
  const keys = diffKeys(flatten({ ...old, id: undefined, _priv: undefined }), flatten(next)).filter(k => !PRESERVE.includes(k) && k !== 'id' && !k.startsWith('_priv'));
  const b = writeBatch(db);
  b.set(propRef(old.id), next);
  if (canOwner) b.set(privRef(old.id), priv);
  log(b, user, 'property_update', old.id, old.code, { changedKeys: keys.slice(0, 30) });
  if (old.price !== pub.price) log(b, user, 'price_change', old.id, old.code, { from: old.price ?? null, to: pub.price ?? null });
  await b.commit();
}

export async function changeStatus(user, p, status, finalPrice) {
  const closed = status === 'sold' || status === 'rented';
  const b = writeBatch(db);
  b.update(propRef(p.id), { status, isArchived: archiveFor(status), statusChangedAt: serverTimestamp(), statusChangedBy: user.uid, statusChangedByName: user.name || '',
    ...(closed && { closedAt: serverTimestamp() }), ...stamp(user) });
  if (closed) b.set(doc(collection(db, 'deals')), { propertyId: p.id, code: p.code, kind: status === 'sold' ? 'sale' : 'rent', listedPrice: p.price ?? null, finalPrice: finalPrice ?? p.price ?? null, closedBy: user.uid, closedByName: user.name || '', closedAt: serverTimestamp() });
  log(b, user, 'status_change', p.id, p.code, { from: p.status, to: status });
  await b.commit();
}

export async function deleteProperty(user, p) {
  const b = writeBatch(db);
  b.delete(privRef(p.id)); b.delete(propRef(p.id));
  log(b, user, 'property_delete', p.id, p.code);
  await b.commit();
}

/** يبني استعلام قائمة بقيود خادمية (ترتيب بالأحدث). */
export function listQuery(opts, pageSize = 20, after) {
  const q = [...listFilters(opts).map(([f, op, v]) => where(f, op, v)), orderBy('createdAt', 'desc')];
  if (after) q.push(startAfter(after));
  return query(collection(db, 'properties'), ...q, limit(pageSize));
}
export { getDocs };
