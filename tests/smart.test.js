import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreDuplicate, findDuplicates } from '../js/duplicate-model.js';
import { cleanFilters, clientMatch, scoreSearch, rankNear, hardMatch, nearPlan, NEAR_LIMIT } from '../js/search-model.js';
import { takeNextNo, FIRST_NO } from '../js/code-counter.js';

/* ======== التكرار ======== */
const base = { propertyType: 'apartment', transactionType: 'sale', area: 150, floor: 3, rooms: 3, bathrooms: 2, price: 1400000, location: { district: 'الخانكة', street: 'شارع الجمهورية', buildingNo: '12' } };
const ex = (o = {}) => ({ id: 'e1', ...base, ...o, location: { ...base.location, ...(o.location || {}) } });

test('مطابق تمامًا → تحذير بنسبة عالية', () => { const m = scoreDuplicate(base, ex()); assert.ok(m.flagged && m.score >= 90, String(m.score)); });
test('نفس المواصفات بسعر مختلف → يبقى مكررًا محتملًا، والسعر يظهر كفرق فقط', () => {
  const a = scoreDuplicate(base, ex()), b = scoreDuplicate({ ...base, price: 1700000 }, ex());
  assert.equal(a.score, b.score); assert.ok(b.flagged); assert.match(b.priceNote, /لا يعني اختلاف العقار/);
});
test('اختلاف السمسار/الهاتف لا يدخل في النسبة (لا حقول له في المقارنة)', () => {
  const m = scoreDuplicate({ ...base, brokerPhone: '010', owner: { phone: '1' } }, ex({ brokerPhone: '011' })); assert.equal(m.score, scoreDuplicate(base, ex()).score);
});
test('قريب في المساحة ومختلف في الدور → نسبة أقل مع إظهار الفرق', () => {
  const full = scoreDuplicate(base, ex()), m = scoreDuplicate({ ...base, area: 145, floor: 5 }, ex());
  assert.ok(m.score < full.score); assert.ok(m.differences.some(d => d.key === 'floor' && d.state === 'diff')); assert.ok(m.differences.some(d => d.key === 'area' && d.state === 'close'));
});
test('لا يُعتمد على السعر وحده أو المساحة وحدها', () => {
  assert.equal(scoreDuplicate({ propertyType: 'apartment', transactionType: 'sale', area: 150, price: 1400000 }, ex({ location: {}, floor: undefined, rooms: undefined, bathrooms: undefined })).flagged, false);
  assert.equal(findDuplicates({ ...base, location: { district: 'القلج', street: 'شارع آخر' }, floor: 9, rooms: 5, bathrooms: 4 }, [ex()]).length, 0);
});
test('لا خلط بين بيع/إيجار أو أنواع العقارات', () => {
  assert.equal(scoreDuplicate(base, ex({ transactionType: 'rent_new' })), null); assert.equal(scoreDuplicate(base, ex({ propertyType: 'villa' })), null);
});
test('الحقول غير المسجلة لا تُعدّ اختلافًا ولا ترفع النسبة تضليلًا', () => {
  const sparse = scoreDuplicate({ propertyType: 'apartment', transactionType: 'sale', location: { district: 'الخانكة', street: 'الجمهورية' } }, ex());
  assert.ok(sparse.score < 100); assert.ok(sparse.signals.some(s => s.state === 'unknown'));
});
test('الترتيب تنازلي والحد الأقصى', () => {
  const pool = [ex({ id: 'a', floor: 5 }), ex({ id: 'b' }), ex({ id: 'c', area: 148 })];
  const r = findDuplicates(base, pool, { max: 2 }); assert.equal(r.length, 2); assert.equal(r[0].item.id, 'b'); assert.ok(r[0].score >= r[1].score);
});

/* ======== البحث الذكي ======== */
const S = (o = {}) => ({ id: 'p' + Math.random(), propertyType: 'apartment', transactionType: 'sale', status: 'available', isArchived: false, price: 1500000, area: 150, rooms: 3, bathrooms: 2, floor: 3, finishing: 'super_lux', location: { district: 'الخانكة' }, ...o });
const F = cleanFilters({ tx: ['sale'], types: ['apartment'], districts: 'الخانكة', priceMax: '1500000', areaMin: '140', areaMax: '160', rooms: ['3'] });

test('تطابق تام: نسبة 100 وexact', () => { const m = scoreSearch(F, S()); assert.equal(m.score, 100); assert.ok(m.exact); assert.ok(clientMatch(S(), F)); });
test('أقرب النتائج: المساحة والسعر قريبان → نسبة عالية مع سبب لكل فرق (مثال العقار 1025)', () => {
  const m = scoreSearch(F, S({ area: 145, price: 1550000 }));
  assert.ok(!m.exact && m.score >= 85, String(m.score));
  const area = m.reasons.find(r => r.key === 'area'), price = m.reasons.find(r => r.key === 'price');
  assert.match(area.text, /145/); assert.match(price.text, /1,550,000|1٬550٬000|1550000/);
});
test('منطقة مختلفة: سقف 74% (المنطقة أولوية عالية)', () => assert.ok(scoreSearch(F, S({ location: { district: 'القلج' } })).score <= 74));
test('قيمة غير مسجلة لا تُعدّ عدم تطابق لكن تُخفِّض الثقة', () => {
  const full = scoreSearch(F, S()), sparse = scoreSearch(F, S({ rooms: undefined, area: undefined }));
  assert.ok(sparse.reasons.filter(r => r.state === 'unknown').length === 2); assert.ok(sparse.score < full.score); assert.ok(sparse.score > 0);
});
test('rankNear: لا بيع/إيجار ولا أنواع مختلفة ولا غير متاح ولا بلا عرض نشط', () => {
  const pool = [S({ id: 'ok', area: 130 }), S({ id: 'rent', transactionType: 'rent_new' }), S({ id: 'villa', propertyType: 'villa' }), S({ id: 'sold', status: 'sold', area: 130 }), S({ id: 'noOffer', area: 130, offersSummary: { activeCount: 0, totalCount: 1, minPrice: 1, maxPrice: 1 } })];
  assert.deepEqual(rankNear(F, pool).map(m => m.item.id), ['ok']);
});
test('rankNear: مرتبة بالتشابه، تستثني المطابق تمامًا والمعروض سابقًا، وبحد أقصى', () => {
  const pool = [S({ id: 'exact' }), S({ id: 'n1', area: 135, price: 1550000 }), S({ id: 'n2', area: 125, price: 1700000 }), S({ id: 'n3', area: 132 })];
  const r = rankNear(F, pool); assert.ok(!r.some(m => m.item.id === 'exact'));
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
  assert.equal(rankNear(F, pool, { skipIds: new Set(['n3']) }).some(m => m.item.id === 'n3'), false);
  const many = Array.from({ length: 40 }, (_, i) => S({ id: 'm' + i, area: 130 })); assert.equal(rankNear(F, many).length, NEAR_LIMIT);
});
test('فلاتر بلا معايير موزونة → لا بدائل (لا نتائج عشوائية)', () => assert.deepEqual(rankNear(cleanFilters({ tx: ['sale'] }), [S()]), []));
test('خطة جلب البدائل بلا نطاقات (لا فهارس جديدة) وبنوع معاملة واحد فقط', () => {
  assert.deepEqual(nearPlan(F).conds, [['status', '==', 'available'], ['transactionType', '==', 'sale']]);
  assert.deepEqual(nearPlan(cleanFilters({ tx: ['rent_new', 'rent_old'] })).conds, [['status', '==', 'available']]);
});
test('الإيجار بنوعيه يبقى ضمن الإيجار فقط', () => {
  const f = cleanFilters({ tx: ['rent_new', 'rent_old'], priceMax: '5000' });
  assert.ok(hardMatch(S({ transactionType: 'rent_old' }), f)); assert.ok(!hardMatch(S({ transactionType: 'sale' }), f));
});

/* ======== توليد الأكواد: محاكاة معاملات Firestore (تحقق متفائل مع إعادة المحاولة) ======== */
function fakeDb() {
  const store = new Map([['counter', { v: 1, data: { customer: 5, request: 2 } }]]); // العداد القديم يحوي مفاتيح العملاء
  let commits = 0;
  const runTransaction = async fn => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const reads = new Map(), writes = [];
      const t = {
        get: async ref => { await new Promise(r => setTimeout(r, Math.random() * 3)); const e = store.get(ref); reads.set(ref, e?.v ?? 0); return { exists: () => !!e, data: () => e && { ...e.data } }; },
        set: (ref, data, opt) => writes.push([ref, data, opt])
      };
      const out = await fn(t);
      if ([...reads].every(([ref, v]) => (store.get(ref)?.v ?? 0) === v)) {       // لم يتغير شيء منذ القراءة → التزام ذرّي
        for (const [ref, data, opt] of writes) { const cur = store.get(ref); store.set(ref, { v: (cur?.v ?? 0) + 1, data: opt?.merge ? { ...(cur?.data || {}), ...data } : data }); }
        commits++; return out;
      }
    }
    throw new Error('too much contention');
  };
  return { runTransaction, store, commits: () => commits };
}
test('عشرون موظفًا يضيفون عقارات في نفس اللحظة: أكواد فريدة متتالية تبدأ من 1001', async () => {
  const { runTransaction, store } = fakeDb();
  const nos = await Promise.all(Array.from({ length: 20 }, () => runTransaction(t => takeNextNo(t, 'counter'))));
  assert.equal(new Set(nos).size, 20); assert.equal(Math.min(...nos), FIRST_NO); assert.equal(Math.max(...nos), FIRST_NO + 19);
  assert.deepEqual(store.get('counter').data.customer, 5);           // مفاتيح العملاء لم تتأثر
  assert.ok(nos.every(n => /^\d+$/.test(String(n))));
});
test('الأكواد لا تُعاد حتى بعد الحذف (العداد لا ينقص)', async () => {
  const { runTransaction } = fakeDb();
  const a = await runTransaction(t => takeNextNo(t, 'counter')), b = await runTransaction(t => takeNextNo(t, 'counter'));
  /* "حذف" العقار b لا يلمس العداد */ const c = await runTransaction(t => takeNextNo(t, 'counter'));
  assert.deepEqual([a, b, c], [1001, 1002, 1003]);
});
