/* Pages CMS edits content/*.json. The original HTML remains as a network-error fallback. */
(function (global) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const lines = value => escape(value).replace(/\r?\n/g, '<br>');
  const bilingual = (jp, en) => `<span class="lang-jp">${lines(jp)}</span><span class="lang-en">${lines(en || jp)}</span>`;
  function safeUrl(value, image = false) {
    const url = String(value || '').trim();
    if (/^https:\/\//i.test(url) || (!image && /^http:\/\//i.test(url))) return escape(url);
    // Images are repository assets; do not allow protocol-relative or executable URLs.
    if (image && /^(?:\.\/|\/)?images\/[\w./% -]+$/i.test(url) && !url.includes('..')) return escape(url);
    return '';
  }
  function photo(item, className) {
    const src = safeUrl(item.photo, true);
    return src ? `<img src="${src}" alt="${escape(item.photo_alt || item.name || item.title)}" class="${className}" loading="lazy" decoding="async" style="object-position:${item.photo_position === 'top' ? 'top' : 'center'}">` : '';
  }
  function member(item, group) {
    const staff = group === 'staff';
    const portrait = photo(item, 'w-full h-full object-cover');
    return `<div class="bg-white rounded-xl shadow-sm ${staff ? 'p-6' : 'p-4 sm:p-6'} flex flex-col items-center text-center border border-gray-100">
      <div class="img-frame frame-1x1 w-full mb-4">${portrait || `<div class="w-full h-full flex items-center justify-center bg-forest-50 text-forest-700 text-3xl" role="img" aria-label="${escape(item.name)}">${escape(Array.from(item.name || '?')[0])}</div>`}</div>
      <h4 class="text-lg font-bold text-forest-700">${bilingual(item.name, item.name_en)}</h4>
      <p class="${staff ? 'mt-2 text-sm' : 'mt-1 text-xs'} font-medium text-gold-500">${bilingual(item.role, item.role_en)}</p>
      ${item.bio || item.bio_en ? `<div class="mt-4 text-sm text-gray-600 leading-relaxed text-left w-full">${bilingual(item.bio, item.bio_en)}</div>` : ''}
    </div>`;
  }
  const categories = {news:['お知らせ','News'], publication:['論文・発表','Publication'], media:['メディア','Media'], project:['プロジェクト','Project']};
  function article(item) {
    const url = safeUrl(item.url);
    const image = photo(item, 'w-full h-full object-cover');
    const tags = (item.categories || []).filter(x => Object.hasOwn(categories, x));
    const tagHtml = tags.map(x => `<span class="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-forest-50 text-forest-700 border border-forest-100">${bilingual(...categories[x])}</span>`).join('');
    const tag = url ? 'a' : 'article';
    return `<${tag} ${url ? `href="${url}" target="_blank" rel="noopener noreferrer"` : ''} class="news-item group flex flex-col bg-white rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-gray-100 hover:shadow-md hover:-translate-y-1 transition-all duration-300 overflow-hidden" data-category="${tags.join(' ')}">
      ${image ? `<div class="h-48 w-full bg-forest-100 relative shrink-0">${image}</div>` : ''}
      <div class="p-8 flex-1 flex flex-col">
        <div class="flex flex-wrap items-center gap-2 mb-4"><time class="text-sm font-medium text-gray-500 mr-1" datetime="${escape(item.date)}">${escape(item.date).replaceAll('-', '.')}</time>${tagHtml}</div>
        <h3 class="text-lg font-bold text-forest-700 leading-snug mb-3">${bilingual(item.title, item.title_en)}</h3>
        <p class="text-sm text-gray-600 leading-relaxed mb-6">${bilingual(item.body, item.body_en)}</p>
        ${url ? `<div class="mt-auto flex items-center text-gold-500 font-semibold text-sm group-hover:text-gold-400 transition-colors">${bilingual(item.link_label || '詳細を見る', item.link_label_en || 'Learn More')}<ion-icon name="arrow-forward-outline" class="ml-1 text-lg"></ion-icon></div>` : ''}
      </div>
    </${tag}>`;
  }
  function validate(data, group) {
    if (!data || !Array.isArray(data.items)) throw new Error(`Invalid ${group} content`);
    for (const item of data.items) {
      if (!item || typeof item !== 'object' || typeof item[group === 'news' ? 'title' : 'name'] !== 'string') throw new Error(`Invalid ${group} entry`);
      if (group === 'news' && (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !Array.isArray(item.categories))) throw new Error('Invalid news date/categories');
    }
    return data.items;
  }
  async function load(document, fetcher) {
    await Promise.all(['staff', 'students', 'alumni', 'news'].map(async group => {
      const container = document.getElementById(`cms-${group}`);
      if (!container) return;
      try {
        const response = await fetcher(`./content/${group}.json`, {cache:'no-cache'});
        if (!response.ok) throw new Error(`Content request failed: ${response.status}`);
        const items = validate(await response.json(), group);
        if (group === 'news') items.sort((a,b) => b.date.localeCompare(a.date));
        container.innerHTML = items.map(item => group === 'news' ? article(item) : member(item, group)).join('');
        if (group === 'news') {
          // Keep a filter selected while the request was in flight.
          const selected = document.querySelector('.news-filter-btn.border-gold-500');
          const filter = selected?.getAttribute('data-filter') || 'all';
          container.querySelectorAll('.news-item').forEach(item => {
            item.style.display = filter === 'all' || item.getAttribute('data-category').split(' ').includes(filter) ? 'flex' : 'none';
          });
        }
      } catch (error) {
        console.error(`Could not load ${group}; keeping existing HTML.`, error);
      }
    }));
  }
  if (typeof module !== 'undefined') module.exports = {escape, safeUrl, member, article, validate, load};
  if (global.document) load(global.document, global.fetch.bind(global));
})(typeof window !== 'undefined' ? window : globalThis);
