// ترحيل آمن (للمدير): ينقل بيانات السمسار القديمة إلى عروض، ويسند أكواد رقمية للعقارات القديمة بترتيب الإضافة.
// لا يحذف أي حقل قديم. كل عقار في معاملة مستقلة (ذرّية)، وإعادة التشغيل لا تكرر شيئًا (معرّف العرض ثابت legacy_<id> + وسم).
import { db, doc, collection, getDoc, getDocs, query, orderBy, limit, startAfter, runTransaction, writeBatch, serverTimestamp } from '../firebase-config.js';
import { planMigration, emptyReport, tally } from '../migration-model.js';
import { takeNextNo } from '../code-counter.js';
import { offerRef, offerPrivRef, offersCol, syncSummary } from './offers.js';

const PAGE = 100;
async function* eachProperty() {
  let after = null;
  for (;;) {
    const s = await getDocs(query(collection(db, 'properties'), orderBy('createdAt', 'asc'), ...(after ? [startAfter(after)] : []), limit(PAGE)));
    if (!s.size) return;
    for (const d of s.docs) yield d;
    after = s.docs.at(-1);
    if (s.size < PAGE) return;
  }
}

/** نسخة احتياطية JSON كاملة (العقارات + الخاص + العروض + العدادات). تُنزَّل من المتصفح قبل أي ترحيل فعلي. */
export async function buildBackup(onProgress = () => {}) {
  const out = { kind: 'real-estate-backup', version: 1, exportedAt: new Date().toISOString(), counters: (await getDoc(doc(db, 'settings', 'counters')).catch(() => null))?.data?.() || null, properties: [] };
  const ser = d => JSON.parse(JSON.stringify(d, (k, v) => (v && typeof v.toMillis === 'function' ? { __ts: v.toMillis() } : v)));
  for await (const d of eachProperty()) {
    const priv = (await getDoc(doc(db, 'properties', d.id, 'private', 'data')).catch(() => null))?.data?.() || null;
    const offers = await Promise.all((await getDocs(offersCol(d.id))).docs.map(async o => ({ id: o.id, data: ser(o.data()), private: ser((await getDoc(offerPrivRef(d.id, o.id)).catch(() => null))?.data?.() || null) })));
    out.properties.push({ id: d.id, data: ser(d.data()), private: ser(priv), offers });
    onProgress(out.properties.length);
  }
  return out;
}

async function migrateOne(user, d, dryRun) {
  const prop = { id: d.id, ...d.data() };
  const priv = (await getDoc(doc(db, 'properties', d.id, 'private', 'data')).catch(() => null))?.data?.() || {};
  const exists = (await getDoc(offerRef(d.id, 'legacy_' + d.id))).exists();
  const plan = planMigration(prop, priv, exists);
  if (dryRun || plan.action === 'skip') return plan;
  const oRef = offerRef(d.id, plan.offerId);
  await runTransaction(db, async t => {
    // Firestore يشترط تنفيذ كل القراءات قبل أي كتابة داخل المعاملة.
    const pSnap = await t.get(doc(db, 'properties', d.id));
    const oSnap = plan.offer ? await t.get(oRef) : null;
    const cur = pSnap.data();
    if (cur.offersMigrated === true && cur.propertyNo != null) return;            // سبقنا غيرنا
    const patch = { offersMigrated: true, offersMigratedAt: serverTimestamp(), offersMigrationNote: plan.note };
    if (cur.propertyNo == null) patch.propertyNo = await takeNextNo(t, doc(db, 'settings', 'counters')); // قراءة العداد ثم كتابته
    if (plan.offer && !oSnap.exists()) {
      t.set(oRef, { ...plan.offer.pub, propertyId: d.id, createdBy: user.uid, createdByName: user.name || '', originalCreatedBy: prop.createdBy || null, originalCreatedByName: prop.createdByName || null,
        originalCreatedAt: prop.createdAt || null, createdAt: serverTimestamp(), updatedBy: user.uid, updatedByName: user.name || '', updatedAt: serverTimestamp() });
      if (Object.keys(plan.offer.priv).length) t.set(offerPrivRef(d.id, plan.offerId), plan.offer.priv);
    }
    t.update(doc(db, 'properties', d.id), patch);
  });
  await syncSummary(user, d.id);
  return plan;
}

/** dryRun=true: يحصي فقط دون أي كتابة. العقار الفاشل لا يوقف البقية ويُسجَّل في التقرير. */
export async function runMigration(user, { dryRun = true, onProgress = () => {} } = {}) {
  const report = emptyReport();
  for await (const d of eachProperty()) {
    try { tally(report, await migrateOne(user, d, dryRun)); } catch (e) { console.error(e); tally(report, null, { id: d.id, message: e.message }); }
    onProgress(report);
  }
  report.dryRun = dryRun;
  if (!dryRun) {
    const b = writeBatch(db);
    b.set(doc(db, 'migrations', 'offers_v1'), { ...report, lastRunAt: serverTimestamp(), lastRunBy: user.uid, lastRunByName: user.name || '' });
    b.set(doc(collection(db, 'activityLogs')), { userId: user.uid, userName: user.name || '', action: 'migration_run', entityType: 'migration', entityId: 'offers_v1', entityLabel: `${report.migrated} عقار، فشل ${report.failed}`, createdAt: serverTimestamp() });
    await b.commit().catch(e => console.error(e));
  }
  return report;
}
export const lastReport = async () => (await getDoc(doc(db, 'migrations', 'offers_v1')).catch(() => null))?.data?.() || null;
