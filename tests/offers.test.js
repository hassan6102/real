import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOffer, buildOffer, summarize, priceInfo, legacyToOffer, legacyOfferId } from '../js/offers-model.js';
import { planMigration, emptyReport, tally } from '../js/migration-model.js';
import { carryLegacyPublic, carryLegacyPrivate, displayCode, parseCodeQuery, buildDoc } from '../js/property-model.js';

test('تكرار رقم الهاتف مسموح: لا شيء في التحقق أو البناء يمنعه ولا يوجد مفتاح فريد', () => {
  const a = buildOffer({ price: '1000000', brokerPhone: '01012345678' }), b = buildOffer({ price: '900000', brokerPhone: '01012345678' });
  assert.equal(a.priv.brokerPhone, b.priv.brokerPhone);
  assert.deepEqual(validateOffer({ price: '5', brokerPhone: '01012345678' }), {});
});
test('التحقق: السعر مطلوب، والهاتف اختياري لكن صالح إن وُجد', () => {
  assert.ok(validateOffer({}).price); assert.ok(validateOffer({ price: '0' }).price);
  assert.ok(validateOffer({ price: '5', brokerPhone: '12' }).brokerPhone); assert.deepEqual(validateOffer({ price: '١٬٤٠٠٬٠٠٠' }), {});
  assert.ok(validateOffer({ price: '5', commissionPercent: '120' }).commissionPercent);
});
test('بيانات السمسار في المستند الخاص فقط، والعام فيه السعر والحالة', () => {
  const { pub, priv } = buildOffer({ price: '1,400,000', brokerName: 'أحمد', brokerPhone: '0101 234 5678', commissionPercent: '2.5', notes: 'ن' });
  assert.equal(pub.price, 1400000); assert.equal(pub.status, 'active'); assert.ok(!('brokerPhone' in pub) && !('notes' in pub));
  assert.equal(priv.brokerPhoneKey, '01012345678'); assert.equal(priv.commissionPercent, 2.5);
});
test('الملخص: أقل سعر نشط، والعروض غير النشطة لا تؤثر', () => {
  const s = summarize([{ status: 'active', price: 1500000 }, { status: 'active', price: 1400000 }, { status: 'unavailable', price: 1000000 }]);
  assert.deepEqual(s, { activeCount: 2, totalCount: 3, minPrice: 1400000, maxPrice: 1500000 });
});
test('تعديل سعر عرض لا يغيّر عروضًا أخرى (الملخص يُحسب من كل عرض مستقلًا)', () => {
  const offers = [{ id: 'a', status: 'active', price: 1500000 }, { id: 'b', status: 'active', price: 1400000 }];
  const edited = offers.map(o => (o.id === 'b' ? { ...o, price: 1600000 } : o));
  assert.equal(edited[0].price, 1500000); assert.equal(summarize(edited).minPrice, 1500000);
});
test('إيقاف كل العروض لا يحذف شيئًا: الملخص يبقى بسعر آخر ويُنبَّه "لا يوجد عرض نشط"', () => {
  const s = summarize([{ status: 'unavailable', price: 900000 }]); assert.equal(s.activeCount, 0); assert.equal(s.minPrice, 900000);
  const i = priceInfo({ price: 900000, offersSummary: s }); assert.ok(i.noActive && i.note);
});
test('priceInfo: يوضح أقل عرض عند التعدد، ويعمل مع العقار القديم بلا ملخص', () => {
  assert.match(priceInfo({ price: 1400000, offersSummary: { activeCount: 3, totalCount: 3, minPrice: 1400000, maxPrice: 1550000 } }).note, /أقل عرض من 3/);
  assert.equal(priceInfo({ price: 1000000 }).note, ''); assert.equal(priceInfo({}).text, 'السعر غير مسجل');
});

/* ---- الترحيل ---- */
const prop = { id: 'p1', price: 1200000, status: 'available' };
const priv = { owner: { kind: 'broker', brokerName: 'سمسار', brokerPhone: '01099999999', phone: '01011111111', notes: 'ملاحظة', commission: '2%' }, financial: { commissionPercent: 2, commissionValue: 24000, commissionPayer: 'both', minPrice: 1100000 } };
test('الترحيل لا يفقد الهاتف والسعر والعمولة والملاحظات ويحتفظ بنسخة قديمة كاملة', () => {
  const o = legacyToOffer(prop, priv);
  assert.equal(o.pub.price, 1200000); assert.equal(o.pub.sourceKind, 'broker'); assert.equal(o.pub.status, 'active');
  assert.equal(o.priv.brokerPhone, '01099999999'); assert.equal(o.priv.brokerName, 'سمسار'); assert.equal(o.priv.notes, 'ملاحظة');
  assert.equal(o.priv.commissionAgreed, '2%'); assert.equal(o.priv.commissionPercent, 2); assert.equal(o.priv.commissionValue, 24000); assert.equal(o.priv.commissionPayer, 'both'); assert.equal(o.priv.minPrice, 1100000);
  assert.deepEqual(o.priv.legacy.owner, priv.owner);          // رقم المالك الثاني لا يضيع
});
test('مالك مباشر: الهاتف هاتف المالك. عقار مباع: العرض منتهٍ', () => {
  const o = legacyToOffer({ ...prop, status: 'sold' }, { owner: { kind: 'direct', name: 'مالك', phone: '01022222222' } });
  assert.equal(o.pub.sourceKind, 'owner'); assert.equal(o.priv.brokerPhone, '01022222222'); assert.equal(o.pub.status, 'expired');
});
test('لا بيانات إطلاقًا → لا عرض', () => assert.equal(legacyToOffer({ id: 'x' }, {}), null));
test('الترحيل idempotent: المُرحَّل سابقًا يُتخطى، ومعرّف العرض ثابت', () => {
  assert.equal(planMigration({ ...prop, offersMigrated: true, propertyNo: 1001 }, priv).action, 'skip');
  const a = planMigration(prop, priv), b = planMigration(prop, priv);
  assert.equal(a.offerId, legacyOfferId('p1')); assert.deepEqual(a, b);
  assert.equal(planMigration(prop, priv, true).offer, null);   // العرض موجود فعلًا → لا تكرار
});
test('عقار مُرحَّل بلا كود رقمي يُستكمل كوده فقط', () => { const p = planMigration({ ...prop, offersMigrated: true }, priv, true); assert.equal(p.action, 'migrate'); assert.ok(p.needsNo); });
test('تقرير الترحيل يعدّ الناجح والفاشل', () => {
  const r = emptyReport(); tally(r, planMigration(prop, priv)); tally(r, planMigration({ id: 'z' }, {})); tally(r, { action: 'skip' }); tally(r, null, { id: 'bad', message: 'x' });
  assert.deepEqual([r.scanned, r.migrated, r.noData, r.skipped, r.failed], [4, 1, 1, 1, 1]);
});

/* ---- حفظ الحقول القديمة عند التعديل ---- */
test('تعديل عقار قديم لا يمسح المحافظة/المدينة ولا بيانات الوسيط القديمة', () => {
  const old = { location: { governorate: 'القليوبية', city: 'الخانكة', cityKey: 'الخانكه', governorateKey: 'x', district: 'أ' } };
  const next = carryLegacyPublic(old, { location: { district: 'ب' } });
  assert.equal(next.location.city, 'الخانكة'); assert.equal(next.location.governorate, 'القليوبية'); assert.equal(next.location.district, 'ب');
  const np = carryLegacyPrivate({ owner: { kind: 'broker', brokerPhone: '010', name: 'م' }, financial: { commissionAgreed: '2%', debts: 'د' } }, { owner: { name: 'جديد' } });
  assert.equal(np.owner.brokerPhone, '010'); assert.equal(np.owner.name, 'جديد'); assert.equal(np.financial.commissionAgreed, '2%');
});
test('الاستمارة الجديدة لا تُنتج حقول مدينة/محافظة', () => {
  const { pub } = buildDoc({ propertyType: 'apartment', transactionType: 'sale', 'location.district': 'الخانكة', price: '5', area: '90' });
  assert.ok(!('city' in (pub.location || {})) && !('cityKey' in (pub.location || {})) && !('governorateKey' in (pub.location || {})));
});
test('الكود: العرض الرقمي أولًا ثم القديم، وبحث الكود بأرقام عربية', () => {
  assert.equal(displayCode({ propertyNo: 1025, code: '1025' }), '1025'); assert.equal(displayCode({ code: 'P-000007' }), 'P-000007');
  assert.deepEqual(parseCodeQuery('١٠٢٥'), { no: 1025, code: '1025' }); assert.deepEqual(parseCodeQuery('p-000007'), { code: 'P-000007' }); assert.equal(parseCodeQuery('  '), null);
});
