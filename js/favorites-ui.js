// زر النجمة المشترك: أي عنصر فيه data-fav="<propertyId>" داخل الحاوية يصبح زر مفضلة يعمل.
import { toast } from './layout.js';
import { addFavorite, removeFavorite, watchFavoriteIds } from './services/favorites.js';

export const favButton = id => `<button type="button" class="btn btn-sm btn-outline-secondary fav-btn" data-fav="${id}" aria-pressed="false" aria-label="إضافة إلى المفضلة" title="المفضلة"><i class="bi bi-star"></i></button>`;

export function attachFavorites(container, user, lookup) {
  let ids = new Set();
  const paint = () => container.querySelectorAll('[data-fav]').forEach(b => {
    const on = ids.has(b.dataset.fav);
    b.setAttribute('aria-pressed', on);
    b.title = b.ariaLabel = on ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة';
    b.classList.toggle('active', on);
    b.firstElementChild.className = `bi bi-star${on ? '-fill' : ''}`;
  });
  watchFavoriteIds(user, s => { ids = s; paint(); });
  new MutationObserver(paint).observe(container, { childList: true, subtree: true });
  container.addEventListener('click', async e => {
    const b = e.target.closest('[data-fav]'); if (!b || b.disabled) return;
    const id = b.dataset.fav; b.disabled = true;
    try {
      if (ids.has(id)) { await removeFavorite(user, id); toast('أُزيل العقار من المفضلة.'); }
      else { await addFavorite(user, { id, code: lookup?.(id)?.code }); toast('أُضيف العقار إلى المفضلة.', 'success'); }
    } catch (ex) { console.error(ex); toast('تعذّر تحديث المفضلة.', 'danger'); }
    b.disabled = false;
  });
  paint();
}
