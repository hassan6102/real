// تخطيط ترحيل العقارات القديمة إلى نظام العروض. دالة خالصة: لا تكتب شيئًا ولا تحذف أي حقل قديم.
import { legacyToOffer, legacyOfferId } from './offers-model.js';

/**
 * يقرر ما يجب فعله لعقار واحد.
 * - action 'skip': سبق ترحيله (idempotent) فلا يُنشأ عرض مكرر ولا يتغير الكود.
 * - action 'migrate': يُنشأ العرض القديم (إن وُجدت بيانات) ويُسند كود رقمي إن لم يوجد، ويُوسَم العقار.
 * legacyOfferExists: هل مستند العرض legacy_<id> موجود (يحمي من التكرار حتى لو فشلت كتابة الوسم سابقًا).
 */
export function planMigration(prop, priv, legacyOfferExists = false) {
  const needsNo = prop.propertyNo == null;
  if (prop.offersMigrated === true && !needsNo) return { action: 'skip', reason: 'already_migrated' };
  const offer = legacyOfferExists ? null : legacyToOffer(prop, priv || {});
  let note = 'migrated';
  if (legacyOfferExists) note = 'offer_already_exists';
  else if (!offer) note = 'no_legacy_offer_data';
  return { action: 'migrate', needsNo, offer, offerId: legacyOfferId(prop.id), note };
}

export const emptyReport = () => ({ scanned: 0, migrated: 0, skipped: 0, noData: 0, codesAssigned: 0, failed: 0, failures: [] });
export function tally(report, plan, error) {
  report.scanned++;
  if (error) { report.failed++; report.failures.push({ id: error.id, error: String(error.message || error).slice(0, 200) }); return; }
  if (plan.action === 'skip') { report.skipped++; return; }
  if (plan.note === 'no_legacy_offer_data') report.noData++; else report.migrated++;
  if (plan.needsNo) report.codesAssigned++;
}
