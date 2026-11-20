/*
 * SELF.KG — генератор сайта.
 * Читает контент из папки content/ (её редактирует админ-панель /admin)
 * и собирает готовый сайт в папку dist/.
 * Запуск: node build.js        (PREVIEW=1 node build.js — ссылки вида .../index.html для офлайн-просмотра)
 */
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');
const PREVIEW = process.env.PREVIEW === '1';
const LANGS = ['ru', 'ky', 'en'];
const LANG_PREFIX = { ru: '', ky: 'ky/', en: 'en/' };
const LANG_LABEL = { ru: 'RU', ky: 'KG', en: 'EN' };
const HTML_LANG = { ru: 'ru', ky: 'ky', en: 'en' };

marked.setOptions({ breaks: true });

// ---------- helpers ----------
const readJSON = (p, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
};
const esc = (s = '') => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = (s = '') => (s ? marked.parse(String(s)) : '');
const mdInline = (s = '') => (s ? marked.parseInline(String(s)) : '');
const list = (a) => (Array.isArray(a) ? a.filter(Boolean) : []);
const writeFile = (rel, content) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const copyDir = (src, dst) => {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
};

// Относительная ссылка со страницы `from` на страницу `to` (оба — пути вида "en/visa/usa/")
function rel(from, to) {
  const depth = from.split('/').filter(Boolean).length;
  let r = '../'.repeat(depth) + to;
  if (PREVIEW && (to === '' || to.endsWith('/'))) r += 'index.html';
  return r || './';
}
// Путь к файлу из папки uploads или assets
function asset(from, p) {
  if (!p) return '';
  if (/^https?:\/\//.test(p)) return p;
  return rel(from, p.replace(/^\//, ''));
}

// ---------- сжатые копии фото (экономия трафика) ----------
// При сборке каждое фото из uploads/ сохраняется в уменьшенных копиях WebP (uploads/_s/).
// Если сжатие недоступно, используется оригинал.
const SIZES = {};
function img(from, p, w) {
  if (!p || /^https?:\/\//.test(p)) return asset(from, p);
  const key = p.replace(/^\//, '') + '|' + w;
  return SIZES[key] ? rel(from, SIZES[key]) : asset(from, p);
}
async function makeSizes() {
  let sharp;
  try { sharp = require('sharp'); } catch (e) { console.log('sharp не установлен — фото без сжатия'); return; }
  const src = path.join(ROOT, 'uploads');
  if (!fs.existsSync(src)) return;
  const walk = d => fs.readdirSync(d).flatMap(f => { const x = path.join(d, f); return fs.statSync(x).isDirectory() ? (f === '_s' ? [] : walk(x)) : [x]; });
  const files = walk(src).filter(f => /\.(jpe?g|png|webp|heic|heif)$/i.test(f));
  for (const f of files) {
    const relPath = path.relative(ROOT, f).split(path.sep).join('/');
    for (const w of [600, 1400]) {
      const outRel = 'uploads/_s/' + relPath.replace(/^uploads\//, '').replace(/\.[^.]+$/, '') + '-' + w + '.webp';
      const outAbs = path.join(OUT, outRel);
      try {
        fs.mkdirSync(path.dirname(outAbs), { recursive: true });
        await sharp(f).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(outAbs);
        SIZES[relPath + '|' + w] = outRel;
      } catch (e) { console.log('Не удалось сжать', relPath, e.message); }
    }
  }
  console.log('Сжато фото:', files.length);
}

// ---------- load content ----------
const site = readJSON(path.join(ROOT, 'content/settings/site.json'), {});
const home = {};
for (const l of LANGS) home[l] = readJSON(path.join(ROOT, `content/home/${l}.json`)) || readJSON(path.join(ROOT, 'content/home/ru.json'));

function loadSection(section) {
  const base = path.join(ROOT, 'content', section, 'ru');
  const slugs = fs.existsSync(base) ? fs.readdirSync(base).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)) : [];
  const out = {};
  for (const l of LANGS) {
    out[l] = slugs.map(slug => {
      const ru = readJSON(path.join(base, slug + '.json')) || {};
      const loc = readJSON(path.join(ROOT, 'content', section, l, slug + '.json')) || {};
      // переводимые поля берём из языка, общие (флаг, порядок, фото) — из RU, если в языке пусто
      const d = { ...ru, ...Object.fromEntries(Object.entries(loc).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))) };
      d.slug = slug; d.section = section;
      return d;
    }).filter(d => d.published !== false).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }
  return out;
}
const visas = loadSection('visa');
const study = loadSection('study');

// ---------- UI strings (по умолчанию; перекрываются полем ui в content/home/<lang>.json) ----------
const UI_DEFAULT = {
  ru: { nav_visa: 'Визы', nav_study: 'Учёба за рубежом', nav_about: 'О нас', nav_contacts: 'Контакты', all_visas: 'Все визы', all_study: 'Все страны', cta_consult: 'Бесплатная консультация', cta_whatsapp: 'Написать в WhatsApp', more: 'Подробнее', home: 'Главная', services: 'Что мы делаем', documents: 'Какие документы нужны', steps: 'Как мы работаем', faq: 'Частые вопросы', other_countries: 'Другие направления', form_title: 'Оставьте заявку', form_text: 'Заполните форму — заявка откроется в WhatsApp, менеджер ответит в рабочее время.', form_name: 'Ваше имя', form_phone: 'Телефон', form_direction: 'Направление', form_comment: 'Комментарий (необязательно)', form_submit: 'Отправить в WhatsApp', wa_hello: 'Здравствуйте! Меня интересует', related: 'Также по этой стране', address: 'Адрес', phone: 'Телефон', hours: 'Часы работы', write_us: 'Напишите нам', menu: 'Меню', footer_note: 'Информация на сайте не является публичной офертой. Решение о выдаче визы и зачислении принимают посольства и учебные заведения.', notfound: 'Страница не найдена', notfound_text: 'Возможно, она была перемещена. Перейдите на главную или напишите нам.', visa_short: 'Визы', study_short: 'Учёба', open_map: 'Открыть на карте', all: 'Все', watch_video: 'Смотреть видео', open_photo: 'Открыть фото', close: 'Закрыть', gallery_label: 'Фото и видео', text_label: 'Отзывы клиентов', reviews: 'Отзывы', reviews_title: 'Что говорят клиенты', reviews_more: 'Все отзывы о нас:', prev: 'Назад', next: 'Вперёд' },
  ky: { nav_visa: 'Визалар', nav_study: 'Чет өлкөдө окуу', nav_about: 'Биз жөнүндө', nav_contacts: 'Байланыш', all_visas: 'Бардык визалар', all_study: 'Бардык өлкөлөр', cta_consult: 'Акысыз кеңеш', cta_whatsapp: 'WhatsApp аркылуу жазуу', more: 'Кененирээк', home: 'Башкы бет', services: 'Биз эмне кылабыз', documents: 'Кандай документтер керек', steps: 'Кантип иштейбиз', faq: 'Көп берилүүчү суроолор', other_countries: 'Башка багыттар', form_title: 'Өтүнмө калтырыңыз', form_text: 'Форманы толтуруңуз — өтүнмө WhatsAppта ачылат, менеджер иш убактысында жооп берет.', form_name: 'Атыңыз', form_phone: 'Телефон', form_direction: 'Багыт', form_comment: 'Комментарий (милдеттүү эмес)', form_submit: 'WhatsAppка жөнөтүү', wa_hello: 'Саламатсызбы! Мени кызыктырат:', related: 'Ушул өлкө боюнча дагы', address: 'Дарек', phone: 'Телефон', hours: 'Иш убактысы', write_us: 'Бизге жазыңыз', menu: 'Меню', footer_note: 'Сайттагы маалымат ачык оферта болуп саналбайт. Виза берүү жана окууга кабыл алуу чечимин элчиликтер жана окуу жайлар кабыл алат.', notfound: 'Барак табылган жок', notfound_text: 'Балким, ал башка жерге көчүрүлгөн. Башкы бетке өтүңүз же бизге жазыңыз.', visa_short: 'Визалар', study_short: 'Окуу', open_map: 'Картадан ачуу', all: 'Баары', watch_video: 'Видеону көрүү', open_photo: 'Сүрөттү ачуу', close: 'Жабуу', gallery_label: 'Сүрөттөр жана видео', text_label: 'Кардарлардын пикирлери', reviews: 'Пикирлер', reviews_title: 'Кардарлар эмне дешет', reviews_more: 'Биз тууралуу бардык пикирлер:', prev: 'Артка', next: 'Алдыга' },
  en: { nav_visa: 'Visas', nav_study: 'Study abroad', nav_about: 'About', nav_contacts: 'Contacts', all_visas: 'All visas', all_study: 'All countries', cta_consult: 'Free consultation', cta_whatsapp: 'Message us on WhatsApp', more: 'Learn more', home: 'Home', services: 'What we do', documents: 'Documents you need', steps: 'How we work', faq: 'FAQ', other_countries: 'Other destinations', form_title: 'Send a request', form_text: 'Fill in the form — your request opens in WhatsApp and a manager replies during working hours.', form_name: 'Your name', form_phone: 'Phone', form_direction: 'Destination', form_comment: 'Comment (optional)', form_submit: 'Send via WhatsApp', wa_hello: 'Hello! I am interested in', related: 'Also for this country', address: 'Address', phone: 'Phone', hours: 'Working hours', write_us: 'Write to us', menu: 'Menu', footer_note: 'Information on this website is not a public offer. Visa and admission decisions are made by embassies and educational institutions.', notfound: 'Page not found', notfound_text: 'It may have moved. Go to the home page or message us.', visa_short: 'Visas', study_short: 'Study', open_map: 'Open map', all: 'All', watch_video: 'Watch video', open_photo: 'Open photo', close: 'Close', gallery_label: 'Photos & videos', text_label: 'Client reviews', reviews: 'Reviews', reviews_title: 'What our clients say', reviews_more: 'All reviews:', prev: 'Previous', next: 'Next' },
};
const ui = (l) => ({ ...UI_DEFAULT[l], ...(home[l]?.ui || {}) });

// ---------- URLs ----------
const P = {
  home: (l) => LANG_PREFIX[l],
  visaIndex: (l) => LANG_PREFIX[l] + 'visa/',
  studyIndex: (l) => LANG_PREFIX[l] + 'study/',
  page: (l, d) => LANG_PREFIX[l] + d.section + '/' + d.slug + '/',
  contacts: (l) => LANG_PREFIX[l] + 'contacts/',
};
const siteUrl = (site.site_url || 'https://self.kg').replace(/\/$/, '');
const abs = (p) => siteUrl + '/' + p;

const waNumber = String(site.whatsapp || '').replace(/\D/g, '');
const waLink = (text) => `https://wa.me/${waNumber}${text ? '?text=' + encodeURIComponent(text) : ''}`;

// ---------- icons ----------
const I = {
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm.01 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.22-8.23 8.22Zm4.52-6.16c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.35-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.29Z"/></svg>',
  ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m3 7 9 6 9-6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v5h5M10 13h6M10 17h6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  plane: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 15.5v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8.5l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-5z"/></svg>',
  cap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3 1 9l11 6 9-4.9V17h2V9L12 3Zm-6 9.8V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.2l-6 3.3-6-3.3Z"/></svg>',
  burger: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const flag = (from, code, cls = 'flag') => code ? `<img class="${cls}" src="${asset(from, 'assets/flags/' + code + '.svg')}" alt="" width="40" height="30" loading="lazy">` : '';

// ---------- layout ----------
function head(l, from, { title, description, alternates, ogImage }) {
  const u = ui(l);
  const fullTitle = title ? `${title} — ${site.brand_name || 'SELF'}` : (home[l]?.seo_title || site.brand_name || 'SELF');
  const desc = description || home[l]?.seo_description || '';
  const og = ogImage || site.og_image;
  const alt = (alternates || []).map(a => `<link rel="alternate" hreflang="${HTML_LANG[a.l]}" href="${abs(a.p)}">`).join('\n  ');
  return `<!doctype html>
<html lang="${HTML_LANG[l]}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:title" content="${esc(fullTitle)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  ${og ? `<meta property="og:image" content="${esc(/^https?:/.test(og) ? og : siteUrl + '/' + og.replace(/^\//, ''))}">` : ''}
  ${alt}
  <meta name="theme-color" content="${esc(site.color_primary || '#14246b')}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png">
  <link rel="icon" type="image/png" sizes="96x96" href="/assets/favicon-96.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/favicon-192.png">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="${asset(from, 'assets/fonts.css')}">
  <link rel="stylesheet" href="${asset(from, 'assets/style.css')}">
  <style>:root{${site.color_primary ? `--brand:${esc(site.color_primary)};` : ''}${site.color_accent ? `--accent:${esc(site.color_accent)};` : ''}}</style>
</head>`;
}

function logo(from, l) {
  if (site.logo) return `<a class="logo" href="${rel(from, P.home(l))}"><img src="${asset(from, site.logo)}" alt="${esc(site.brand_name || 'SELF')}"></a>`;
  return `<a class="logo" href="${rel(from, P.home(l))}" aria-label="${esc(site.brand_name || 'SELF')}">
    <span class="logo-mark">SELF</span><span class="logo-sub">visa<i>·</i>academy</span></a>`;
}

function header(l, from, alternates) {
  const u = ui(l);
  const dd = (items, idx, label) => `
      <div class="nav-dd">
        <a class="nav-link" href="${rel(from, idx)}">${esc(label)} ${I.chev}</a>
        <div class="dd-panel">
          ${items.map(d => `<a href="${rel(from, P.page(l, d))}">${flag(from, d.flag)}<span>${esc(d.nav_title || d.country)}</span></a>`).join('')}
        </div>
      </div>`;
  const langs = LANGS.map(x => {
    const a = (alternates || []).find(a => a.l === x);
    return `<a href="${rel(from, a ? a.p : P.home(x))}" class="${x === l ? 'on' : ''}" hreflang="${x}">${LANG_LABEL[x]}</a>`;
  }).join('');
  return `
<a class="skip" href="#main">↓</a>
<header class="site-header">
  <div class="wrap hdr">
    ${logo(from, l)}
    <nav class="nav" id="nav" aria-label="${esc(u.menu)}">
      ${dd(visas[l], P.visaIndex(l), u.nav_visa)}
      ${dd(study[l], P.studyIndex(l), u.nav_study)}
      <a class="nav-link" href="${rel(from, P.home(l))}#about">${esc(u.nav_about)}</a>
      <a class="nav-link" href="${rel(from, P.contacts(l))}">${esc(u.nav_contacts)}</a>
      <div class="nav-mobile-extra">
        <a class="btn btn-wa" href="${waLink()}" target="_blank" rel="noopener">${I.wa}<span>${esc(u.cta_whatsapp)}</span></a>
      </div>
    </nav>
    <div class="hdr-right">
      <div class="langs">${langs}</div>
      ${site.phone_display ? `<a class="hdr-phone" href="tel:${esc(String(site.phone_display).replace(/[^\d+]/g, ''))}">${esc(site.phone_display)}</a>` : ''}
      <a class="btn btn-sm btn-wa hdr-wa" href="${waLink()}" target="_blank" rel="noopener">${I.wa}<span>WhatsApp</span></a>
      <button class="burger" id="burger" aria-label="${esc(u.menu)}" aria-expanded="false" aria-controls="nav">${I.burger}</button>
    </div>
  </div>
</header>`;
}

function footer(l, from) {
  const u = ui(l), h = home[l] || {};
  const year = new Date().getFullYear();
  return `
<footer class="site-footer">
  <div class="wrap ftr">
    <div class="ftr-brand">
      ${logo(from, l)}
      <p>${esc(h.footer_text || '')}</p>
      <div class="socials">
        ${site.instagram ? `<a href="${esc(site.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">${I.ig}</a>` : ''}
        ${waNumber ? `<a href="${waLink()}" target="_blank" rel="noopener" aria-label="WhatsApp">${I.wa}</a>` : ''}
        ${site.email ? `<a href="mailto:${esc(site.email)}" aria-label="Email">${I.mail}</a>` : ''}
      </div>
    </div>
    <div>
      <h4>${esc(u.nav_visa)}</h4>
      <ul>${visas[l].map(d => `<li><a href="${rel(from, P.page(l, d))}">${esc(d.title)}</a></li>`).join('')}</ul>
    </div>
    <div>
      <h4>${esc(u.nav_study)}</h4>
      <ul>${study[l].map(d => `<li><a href="${rel(from, P.page(l, d))}">${esc(d.title)}</a></li>`).join('')}</ul>
    </div>
    <div>
      <h4>${esc(u.nav_contacts)}</h4>
      <ul class="ftr-contacts">
        ${h.address ? `<li>${I.pin}<span>${esc(h.address)}</span></li>` : ''}
        ${site.phone_display ? `<li>${I.phone}<a href="tel:${esc(String(site.phone_display).replace(/[^\d+]/g, ''))}">${esc(site.phone_display)}</a></li>` : ''}
        ${h.hours ? `<li>${I.clock}<span>${esc(h.hours)}</span></li>` : ''}
        ${site.email ? `<li>${I.mail}<a href="mailto:${esc(site.email)}">${esc(site.email)}</a></li>` : ''}
      </ul>
    </div>
  </div>
  <div class="wrap ftr-bottom">
    <span>© ${year} ${esc(site.legal_name || site.brand_name || 'SELF')}</span>
    <span class="ftr-note">${esc(u.footer_note)}</span>
  </div>
</footer>
${lightbox(l)}
<a class="wa-float" href="${waLink()}" target="_blank" rel="noopener" aria-label="WhatsApp">${I.wa}</a>
<script>window.SELF_WA=${JSON.stringify(waNumber)};</script>
<script src="${asset(from, 'assets/site.js')}" defer></script>
</body></html>`;
}

// Форма Битрикс24 (Настройки → «Форма Битрикс24»). Если код не вставлен — работает форма WhatsApp.
function b24Code(l) {
  const code = (l !== 'ru' && site['b24_form_' + l]) || site.b24_form || '';
  return String(code).trim();
}
function leadForm(l, from, preset) {
  const u = ui(l), h = home[l] || {};
  const opts = [
    ...visas[l].map(d => d.title),
    ...study[l].map(d => d.title),
    ...(list(h.form_other_options)),
  ];
  return `
<section class="lead" id="lead">
  <div class="wrap lead-grid">
    <div class="lead-copy">
      <span class="eyebrow">${esc(u.write_us)}</span>
      <h2>${esc(h.form_heading || u.form_title)}</h2>
      <p>${esc(h.form_text || u.form_text)}</p>
      <ul class="lead-contacts">
        ${site.phone_display ? `<li>${I.phone}<a href="tel:${esc(String(site.phone_display).replace(/[^\d+]/g, ''))}">${esc(site.phone_display)}</a></li>` : ''}
        ${h.address ? `<li>${I.pin}<span>${esc(h.address)}</span></li>` : ''}
        ${h.hours ? `<li>${I.clock}<span>${esc(h.hours)}</span></li>` : ''}
        ${site.instagram ? `<li>${I.ig}<a href="${esc(site.instagram)}" target="_blank" rel="noopener">${esc(site.instagram_handle || 'Instagram')}</a></li>` : ''}
      </ul>
      ${b24Code(l) && waNumber ? `<a class="btn btn-wa lead-wa" href="${waLink(u.wa_hello)}" target="_blank" rel="noopener">${I.wa}<span>${esc(u.cta_whatsapp)}</span></a>` : ''}
    </div>
    ${b24Code(l) ? `<div class="lead-form lead-b24">${b24Code(l)}</div>` : `
    <form class="lead-form" data-wa-form data-hello="${esc(u.wa_hello)}">
      <label><span>${esc(u.form_name)}</span><input name="name" required autocomplete="name"></label>
      <label><span>${esc(u.form_phone)}</span><input name="phone" type="tel" required autocomplete="tel" placeholder="+996"></label>
      <label><span>${esc(u.form_direction)}</span>
        <select name="direction">
          ${opts.map(o => `<option${o === preset ? ' selected' : ''}>${esc(o)}</option>`).join('')}
        </select>
      </label>
      <label><span>${esc(u.form_comment)}</span><textarea name="comment" rows="3"></textarea></label>
      <button class="btn btn-wa btn-lg" type="submit">${I.wa}<span>${esc(u.form_submit)}</span></button>
    </form>`}
  </div>
</section>`;
}

function countryCard(l, from, d) {
  const u = ui(l);
  return `
    <a class="ccard" href="${rel(from, P.page(l, d))}" style="--c:${esc(d.accent || 'var(--brand)')}">
      <div class="ccard-top">${flag(from, d.flag, 'flag flag-lg')}<span class="ccard-arrow">${I.arrow}</span></div>
      <h3>${esc(d.title)}</h3>
      <p>${esc(d.tagline || '')}</p>
      ${list(d.chips).length ? `<div class="chips">${list(d.chips).slice(0, 3).map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
    </a>`;
}


// ---------- отзывы: карусель с фото и видео + ссылки на 2ГИС ----------
// Отзывы хранятся в content/reviews/*.json (раздел «⭐ Отзывы» в админке).
// Старые отзывы из «Главная → Отзывы» тоже показываются.
function loadReviews() {
  const dir = path.join(ROOT, 'content', 'reviews');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
  return files.map(f => readJSON(path.join(dir, f))).filter(r => r && r.published !== false)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}
const REVIEWS = loadReviews();
function reviewsFor(l, category) {
  const pick = (r, key) => (l !== 'ru' && r[key + '_' + l]) || r[key] || '';
  const shared = REVIEWS.map(r => ({
    name: r.name, rating: r.rating, source: r.source, date: pick(r, 'date'),
    tag: pick(r, 'tag'), text: pick(r, 'text'), category: r.category || 'visa',
    photo: r.photo, video: r.video, video_url: r.video_url,
  }));
  const legacy = list((home[l] || {}).reviews).map(r => ({ ...r, category: r.category || '' }));
  const all = [...shared, ...legacy];
  return category ? all.filter(r => !r.category || r.category === category) : all;
}
function stars(n) {
  const r = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  return r ? `<span class="rv-stars" aria-label="${r}/5">${'★'.repeat(r)}<i>${'★'.repeat(5 - r)}</i></span>` : '';
}
function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
  return m ? m[1] : '';
}
function reviewMedia(from, r, u) {
  const play = `<span class="rv-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></span>`;
  const yt = youtubeId(r.video_url);
  if (yt) return `<button type="button" class="rv-media is-video" data-lb="yt" data-src="${yt}" aria-label="${esc(u.watch_video)}">
      <img src="${r.photo ? asset(from, r.photo) : `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`}" alt="" loading="lazy">${play}</button>`;
  if (r.video) {
    const v = asset(from, r.video);
    return `<button type="button" class="rv-media is-video" data-lb="video" data-src="${esc(v)}" aria-label="${esc(u.watch_video)}">
      ${r.photo ? `<img src="${img(from, r.photo, 600)}" alt="" loading="lazy">` : `<span class="gal-ph" aria-hidden="true"></span>`}${play}</button>`;
  }
  if (r.video_url) return `<a class="rv-media is-video is-link" href="${esc(r.video_url)}" target="_blank" rel="noopener" aria-label="${esc(u.watch_video)}">
      ${r.photo ? `<img src="${asset(from, r.photo)}" alt="" loading="lazy">` : ''}${play}</a>`;
  if (r.photo) return `<button type="button" class="rv-media" data-lb="img" data-src="${img(from, r.photo, 1400)}" aria-label="${esc(u.open_photo)}">
      <img src="${img(from, r.photo, 600)}" alt="" loading="lazy"></button>`;
  return '';
}
// Галерея фото и видео (раздел «🎬 Фото и видео» в админке) — отдельно от текстовых отзывов
function loadGallery() {
  const dir = path.join(ROOT, 'content', 'gallery');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
  return files.map(f => readJSON(path.join(dir, f))).filter(g => g && g.published !== false && (g.photo || g.video || g.video_url))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}
const GALLERY = loadGallery();
function galleryFor(l, category) {
  const pick = (g, key) => (l !== 'ru' && g[key + '_' + l]) || g[key] || '';
  const all = GALLERY.map(g => ({ ...g, title: pick(g, 'title'), subtitle: pick(g, 'subtitle'), category: g.category || '' }));
  const pool = category ? all.filter(g => !g.category || g.category === category) : all;
  // чередование: фото, видео, фото, видео…
  const isVid = g => !!(g.video || g.video_url);
  const photos = pool.filter(g => !isVid(g)), videos = pool.filter(isVid), out = [];
  for (let i = 0; i < Math.max(photos.length, videos.length); i++) {
    if (photos[i]) out.push(photos[i]);
    if (videos[i]) out.push(videos[i]);
  }
  return out;
}
function galleryTile(from, g, u) {
  const play = `<span class="rv-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></span>`;
  const cap = g.title || g.subtitle ? `<span class="gal-cap"><strong>${esc(g.title)}</strong>${g.subtitle ? `<span>${esc(g.subtitle)}</span>` : ''}</span>` : '';
  const cover = g.photo ? `<img src="${img(from, g.photo, 600)}" alt="${esc(g.title || '')}" loading="lazy" decoding="async">` : '';
  const noCover = `<span class="gal-ph" aria-hidden="true"></span>`;
  const yt = youtubeId(g.video_url);
  let attrs, inner, tag = 'button';
  if (yt) { const tall = /\/shorts\//.test(g.video_url); attrs = `data-lb="yt" data-src="${yt}"${tall ? ' data-shape="tall"' : ''} aria-label="${esc(u.watch_video)}"`; inner = (cover || `<img src="https://i.ytimg.com/vi/${yt}/hqdefault.jpg" alt="" loading="lazy">`) + play; }
  else if (g.video) { const v = asset(from, g.video); attrs = `data-lb="video" data-src="${esc(v)}" aria-label="${esc(u.watch_video)}"`; inner = (cover || noCover) + play; }
  else if (g.video_url) { tag = 'a'; attrs = `href="${esc(g.video_url)}" target="_blank" rel="noopener" aria-label="${esc(u.watch_video)}"`; inner = (cover || noCover) + play; }
  else { attrs = `data-lb="img" data-src="${img(from, g.photo, 1400)}" aria-label="${esc(u.open_photo)}"`; inner = cover; }
  return `<${tag} ${tag === 'button' ? 'type="button" ' : ''}class="gal-tile${g.video || g.video_url ? ' is-video' : ''}" data-cat="${esc(g.category)}" ${attrs}>${inner}${cap}</${tag}>`;
}
function navBtns(u) {
  return `<div class="rv-nav">
              <button type="button" class="rv-btn" data-rv="prev" aria-label="${esc(u.prev)}">${I.arrow}</button>
              <button type="button" class="rv-btn" data-rv="next" aria-label="${esc(u.next)}">${I.arrow}</button>
            </div>`;
}
function reviewsSection(l, from, { category = '', withTabs = false, cls = '' } = {}) {
  const u = ui(l), h = home[l] || {};
  const items = reviewsFor(l, category).map(r => ({ ...r, photo: '', video: '', video_url: '' }));
  const media = galleryFor(l, category);
  const links = list(site.review_links).filter(x => x && x.url);
  if (!items.length && !media.length && !links.length) return '';
  const cats = new Set([...items, ...media].map(r => r.category).filter(Boolean));
  const tabs = withTabs && cats.has('visa') && cats.has('study');
  const linkBtns = links.map(x => `<a class="rv-link" href="${esc(x.url)}" target="_blank" rel="noopener">
      <span class="rv-link-badge">2ГИС</span><span>${esc(x.title || '2GIS')}</span>${I.arrow}</a>`).join('');
  return `
  <section class="block wrap rv-section ${cls}" id="reviews">
      <div class="rv-head">
        <div>
          <span class="eyebrow">${esc(h.reviews_eyebrow || u.reviews)}</span>
          <h2 class="rv-title">${esc(h.reviews_heading || u.reviews_title)}</h2>
        </div>
        ${tabs ? `<div class="rv-tabs">
          <button type="button" class="on" data-cat="">${esc(u.all)}</button>
          <button type="button" data-cat="visa">${esc(u.visa_short)}</button>
          <button type="button" data-cat="study">${esc(u.study_short)}</button>
        </div>` : ''}
      </div>
      ${media.length ? `
      <div class="rv gal">
        <div class="rv-bar"><span class="rv-label">${esc(u.gallery_label)}</span>${media.length > 4 ? navBtns(u) : ''}</div>
        <div class="rv-track gal-track" tabindex="0">${media.map(g => galleryTile(from, g, u)).join('')}</div>
      </div>` : ''}
      ${items.length ? `
      <div class="rv rv-text">
        <div class="rv-bar"><span class="rv-label">${esc(u.text_label)}</span>${items.length > 1 ? navBtns(u) : ''}</div>
        <div class="rv-track" tabindex="0">${items.map(r => `
          <figure class="rv-card" data-cat="${esc(r.category || '')}">
            <div class="rv-body">
              <div class="rv-top">${stars(r.rating)}${r.source ? `<span class="rv-src">${esc(r.source)}</span>` : ''}</div>
              ${r.text ? `<blockquote>${esc(r.text)}</blockquote>` : ''}
              <figcaption><strong>${esc(r.name || '')}</strong>${r.tag || r.date ? `<span>${esc([r.tag, r.date].filter(Boolean).join(' · '))}</span>` : ''}</figcaption>
            </div>
          </figure>`).join('')}</div>
      </div>` : ''}
      ${links.length ? `<div class="rv-links"><span>${esc(u.reviews_more)}</span>${linkBtns}</div>` : ''}
  </section>`;
}
function lightbox(l) {
  const u = ui(l);
  return `<dialog class="lb" id="lb"><button type="button" class="lb-close" aria-label="${esc(u.close)}">${I.close}</button><div class="lb-body"></div></dialog>`;
}

// ---------- pages ----------
function homePage(l) {
  const from = P.home(l), u = ui(l), h = home[l] || {};
  const alternates = LANGS.map(x => ({ l: x, p: P.home(x) }));
  const heroFlags = [...visas[l], ...study[l]].reduce((acc, d) => (acc.find(a => a.flag === d.flag) ? acc : [...acc, d]), []).slice(0, 9);
  return head(l, from, { alternates }) + `<body>` + header(l, from, alternates) + `
<main id="main">
  <section class="hero">
    <div class="wrap hero-grid">
      <div class="hero-copy">
        ${h.hero_badge ? `<span class="badge">${esc(h.hero_badge)}</span>` : ''}
        <h1>${mdInline(h.hero_title || '')}</h1>
        <p class="lead-p">${esc(h.hero_subtitle || '')}</p>
        <div class="hero-ctas">
          <a class="btn btn-primary btn-lg" href="#lead">${esc(u.cta_consult)}</a>
          <a class="btn btn-ghost btn-lg" href="${waLink(u.wa_hello)}" target="_blank" rel="noopener">${I.wa}<span>WhatsApp</span></a>
        </div>
        ${list(h.stats).length ? `<dl class="stats">${list(h.stats).map(s => `<div><dt>${esc(s.value)}</dt><dd>${esc(s.label)}</dd></div>`).join('')}</dl>` : ''}
      </div>
      <div class="hero-art" aria-hidden="true">
        ${h.hero_image ? `<img class="hero-photo" src="${img(from, h.hero_image, 1400)}" alt="">` : ''}
        <div class="stamps">
          ${heroFlags.map((d, i) => `<div class="stamp s${i}">${flag(from, d.flag, 'flag')}<span>${esc(d.country || '')}</span></div>`).join('')}
        </div>
      </div>
    </div>
  </section>

  <section class="dirs wrap">
    <a class="dir dir-visa" href="${rel(from, P.visaIndex(l))}">
      <span class="dir-icon">${I.plane}</span>
      <span class="eyebrow">SelfVisa</span>
      <h2>${esc(h.visa_heading || u.nav_visa)}</h2>
      <p>${esc(h.visa_text || '')}</p>
      <span class="dir-flags">${visas[l].map(d => flag(from, d.flag)).join('')}</span>
      <span class="dir-more">${esc(u.all_visas)} ${I.arrow}</span>
    </a>
    <a class="dir dir-study" href="${rel(from, P.studyIndex(l))}">
      <span class="dir-icon">${I.cap}</span>
      <span class="eyebrow">SelfAcademy</span>
      <h2>${esc(h.study_heading || u.nav_study)}</h2>
      <p>${esc(h.study_text || '')}</p>
      <span class="dir-flags">${study[l].map(d => flag(from, d.flag)).join('')}</span>
      <span class="dir-more">${esc(u.all_study)} ${I.arrow}</span>
    </a>
  </section>
  ${reviewsSection(l, from, { withTabs: true, cls: 'rv-home' })}

  <section class="block wrap" id="visas">
    <div class="block-head"><span class="eyebrow">SelfVisa</span><h2>${esc(h.visa_grid_heading || u.nav_visa)}</h2><a class="link-more" href="${rel(from, P.visaIndex(l))}">${esc(u.all_visas)} ${I.arrow}</a></div>
    <div class="cgrid">${visas[l].map(d => countryCard(l, from, d)).join('')}</div>
  </section>

  <section class="block wrap" id="study">
    <div class="block-head"><span class="eyebrow">SelfAcademy</span><h2>${esc(h.study_grid_heading || u.nav_study)}</h2><a class="link-more" href="${rel(from, P.studyIndex(l))}">${esc(u.all_study)} ${I.arrow}</a></div>
    <div class="cgrid">${study[l].map(d => countryCard(l, from, d)).join('')}</div>
  </section>

  <section class="about" id="about">
    <div class="wrap">
      <div class="block-head"><span class="eyebrow">${esc(u.nav_about)}</span><h2>${esc(h.about_heading || '')}</h2></div>
      <div class="about-grid">
        <div class="about-text prose">${md(h.about_text || '')}</div>
        <div class="adv">
          ${list(h.advantages).map(a => `<div class="adv-item"><span class="adv-check">${I.check}</span><div><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></div></div>`).join('')}
        </div>
      </div>
    </div>
  </section>

  ${list(h.steps).length ? `
  <section class="block wrap">
    <div class="block-head"><span class="eyebrow">${esc(u.steps)}</span><h2>${esc(h.steps_heading || u.steps)}</h2></div>
    <ol class="steps">${list(h.steps).map(s => `<li><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('')}</ol>
  </section>` : ''}

  ${faqBlock(list(h.faq), u.faq)}
  ${leadForm(l, from)}
</main>` + footer(l, from);
}

function faqBlock(items, heading) {
  if (!items.length) return '';
  return `
  <section class="block wrap faq-wrap">
    <div class="block-head"><h2>${esc(heading)}</h2></div>
    <div class="faq">${items.map(f => `<details><summary>${esc(f.q)}<span>${I.chev}</span></summary><div class="prose">${md(f.a)}</div></details>`).join('')}</div>
  </section>`;
}

function indexPage(l, section) {
  const items = section === 'visa' ? visas[l] : study[l];
  const from = section === 'visa' ? P.visaIndex(l) : P.studyIndex(l);
  const u = ui(l), h = home[l] || {};
  const alternates = LANGS.map(x => ({ l: x, p: section === 'visa' ? P.visaIndex(x) : P.studyIndex(x) }));
  const title = section === 'visa' ? (h.visa_heading || u.nav_visa) : (h.study_heading || u.nav_study);
  const text = section === 'visa' ? h.visa_text : h.study_text;
  return head(l, from, { title, description: text, alternates }) + `<body>` + header(l, from, alternates) + `
<main id="main">
  <section class="page-hero plain">
    <div class="wrap">
      <nav class="crumbs"><a href="${rel(from, P.home(l))}">${esc(u.home)}</a><span>/</span><span>${esc(title)}</span></nav>
      <span class="eyebrow">${section === 'visa' ? 'SelfVisa' : 'SelfAcademy'}</span>
      <h1>${esc(title)}</h1>
      <p class="lead-p">${esc(text || '')}</p>
    </div>
  </section>
  <section class="block wrap"><div class="cgrid">${items.map(d => countryCard(l, from, d)).join('')}</div></section>
  ${reviewsSection(l, from, { category: section })}
  ${leadForm(l, from)}
</main>` + footer(l, from);
}

function countryPage(l, d) {
  const from = P.page(l, d), u = ui(l);
  const alternates = LANGS.map(x => ({ l: x, p: P.page(x, d) }));
  const siblings = (d.section === 'visa' ? visas[l] : study[l]).filter(x => x.slug !== d.slug);
  const twin = (d.section === 'visa' ? study[l] : visas[l]).find(x => x.flag === d.flag);
  const idx = d.section === 'visa' ? P.visaIndex(l) : P.studyIndex(l);
  const idxLabel = d.section === 'visa' ? u.nav_visa : u.nav_study;
  const waText = `${u.wa_hello} ${d.title}`;
  const heroImg = d.image ? img(from, d.image, 1400) : '';
  return head(l, from, { title: d.seo_title || d.title, description: d.seo_description || d.tagline, alternates, ogImage: d.image }) + `<body>` + header(l, from, alternates) + `
<main id="main">
  <section class="page-hero${heroImg ? ' has-img' : ''}" style="--c:${esc(d.accent || 'var(--brand)')}">
    ${heroImg ? `<img class="ph-img" src="${heroImg}" alt="">` : `<div class="ph-pattern" aria-hidden="true">${flag(from, d.flag, 'ph-flag')}</div>`}
    <div class="wrap ph-inner">
      <nav class="crumbs"><a href="${rel(from, P.home(l))}">${esc(u.home)}</a><span>/</span><a href="${rel(from, idx)}">${esc(idxLabel)}</a><span>/</span><span>${esc(d.country || d.title)}</span></nav>
      <div class="ph-title">${flag(from, d.flag, 'flag flag-xl')}<h1>${esc(d.title)}</h1></div>
      <p class="lead-p">${esc(d.tagline || '')}</p>
      ${list(d.chips).length ? `<div class="chips chips-lg">${list(d.chips).map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      <div class="hero-ctas">
        <a class="btn btn-primary btn-lg" href="#lead">${esc(u.cta_consult)}</a>
        <a class="btn btn-ghost btn-lg" href="${waLink(waText)}" target="_blank" rel="noopener">${I.wa}<span>WhatsApp</span></a>
      </div>
    </div>
  </section>

  ${list(d.facts).length ? `<div class="wrap"><dl class="facts">${list(d.facts).map(f => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl></div>` : ''}

  <div class="wrap page-grid">
    <article class="page-main">
      ${d.intro ? `<div class="prose intro">${md(d.intro)}</div>` : ''}

      ${list(d.services).length ? `
      <section class="pblock">
        <h2>${esc(u.services)}</h2>
        <ul class="checks">${list(d.services).map(s => `<li>${I.check}<span>${mdInline(s)}</span></li>`).join('')}</ul>
      </section>` : ''}

      ${list(d.sections).map(s => `
      <section class="pblock">
        <h2>${esc(s.heading)}</h2>
        <div class="prose">${md(s.body)}</div>
      </section>`).join('')}

      ${list(d.documents).length ? `
      <section class="pblock">
        <h2>${esc(u.documents)}</h2>
        <ul class="docs">${list(d.documents).map(s => `<li>${I.doc}<span>${mdInline(s)}</span></li>`).join('')}</ul>
        ${d.documents_note ? `<p class="note">${esc(d.documents_note)}</p>` : ''}
      </section>` : ''}

      ${list(d.steps).length ? `
      <section class="pblock">
        <h2>${esc(u.steps)}</h2>
        <ol class="steps steps-v">${list(d.steps).map(s => `<li><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('')}</ol>
      </section>` : ''}

      ${list(d.faq).length ? `
      <section class="pblock">
        <h2>${esc(u.faq)}</h2>
        <div class="faq">${list(d.faq).map(f => `<details><summary>${esc(f.q)}<span>${I.chev}</span></summary><div class="prose">${md(f.a)}</div></details>`).join('')}</div>
      </section>` : ''}
    </article>

    <aside class="page-side">
      <div class="side-card">
        <h3>${esc(u.cta_consult)}</h3>
        <p>${esc(d.side_text || u.form_text)}</p>
        <a class="btn btn-wa btn-block" href="${waLink(waText)}" target="_blank" rel="noopener">${I.wa}<span>${esc(u.cta_whatsapp)}</span></a>
        ${site.phone_display ? `<a class="side-phone" href="tel:${esc(String(site.phone_display).replace(/[^\d+]/g, ''))}">${I.phone}${esc(site.phone_display)}</a>` : ''}
      </div>
      ${twin ? `<a class="side-twin" href="${rel(from, P.page(l, twin))}"><span class="eyebrow">${esc(u.related)}</span><strong>${flag(from, twin.flag)}${esc(twin.title)}</strong>${I.arrow}</a>` : ''}
      <div class="side-list">
        <h4>${esc(u.other_countries)}</h4>
        ${siblings.map(s => `<a href="${rel(from, P.page(l, s))}">${flag(from, s.flag)}<span>${esc(s.title)}</span></a>`).join('')}
      </div>
    </aside>
  </div>
  ${reviewsSection(l, from, { category: d.section })}
  ${leadForm(l, from, d.title)}
</main>` + footer(l, from);
}

function contactsPage(l) {
  const from = P.contacts(l), u = ui(l), h = home[l] || {};
  const alternates = LANGS.map(x => ({ l: x, p: P.contacts(x) }));
  return head(l, from, { title: u.nav_contacts, alternates }) + `<body>` + header(l, from, alternates) + `
<main id="main">
  <section class="page-hero plain">
    <div class="wrap">
      <nav class="crumbs"><a href="${rel(from, P.home(l))}">${esc(u.home)}</a><span>/</span><span>${esc(u.nav_contacts)}</span></nav>
      <h1>${esc(u.nav_contacts)}</h1>
    </div>
  </section>
  <section class="wrap contacts-grid">
    <div class="contact-cards">
      ${h.address ? `<div class="contact-card">${I.pin}<div><span>${esc(u.address)}</span><strong>${esc(h.address)}</strong>${site.map_url ? `<a href="${esc(site.map_url)}" target="_blank" rel="noopener">${esc(u.open_map)} →</a>` : ''}</div></div>` : ''}
      ${site.phone_display ? `<div class="contact-card">${I.phone}<div><span>${esc(u.phone)}</span><strong><a href="tel:${esc(String(site.phone_display).replace(/[^\d+]/g, ''))}">${esc(site.phone_display)}</a></strong></div></div>` : ''}
      ${waNumber ? `<div class="contact-card">${I.wa}<div><span>WhatsApp</span><strong><a href="${waLink()}" target="_blank" rel="noopener">${esc(site.whatsapp_display || site.phone_display || '+' + waNumber)}</a></strong></div></div>` : ''}
      ${site.instagram ? `<div class="contact-card">${I.ig}<div><span>Instagram</span><strong><a href="${esc(site.instagram)}" target="_blank" rel="noopener">${esc(site.instagram_handle || site.instagram)}</a></strong></div></div>` : ''}
      ${h.hours ? `<div class="contact-card">${I.clock}<div><span>${esc(u.hours)}</span><strong>${esc(h.hours)}</strong></div></div>` : ''}
      ${site.email ? `<div class="contact-card">${I.mail}<div><span>Email</span><strong><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></strong></div></div>` : ''}
    </div>
    <div class="map">${site.map_embed ? `<iframe src="${esc(site.map_embed)}" loading="lazy" title="map" allowfullscreen></iframe>` : `<div class="map-ph">${I.pin}<strong>${esc(h.address || '')}</strong></div>`}</div>
  </section>
  ${leadForm(l, from)}
</main>` + footer(l, from);
}

function notFound() {
  const l = 'ru', from = '', u = ui(l);
  return head(l, from, { title: u.notfound }) + `<body>` + header(l, from) + `
<main id="main"><section class="page-hero plain"><div class="wrap"><h1>404 — ${esc(u.notfound)}</h1><p class="lead-p">${esc(u.notfound_text)}</p>
<div class="hero-ctas"><a class="btn btn-primary btn-lg" href="${rel(from, '')}">${esc(u.home)}</a><a class="btn btn-ghost btn-lg" href="${waLink()}">${I.wa}<span>WhatsApp</span></a></div></div></section></main>` + footer(l, from);
}

// ---------- build ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
copyDir(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));
fs.copyFileSync(path.join(ROOT, 'assets/favicon.ico'), path.join(OUT, 'favicon.ico'));
copyDir(path.join(ROOT, 'uploads'), path.join(OUT, 'uploads'));
copyDir(path.join(ROOT, 'admin'), path.join(OUT, 'admin'));

makeSizes().then(buildPages);

function buildPages() {
const urls = [];
const out = (p, html) => { writeFile(p + 'index.html', html); urls.push(p); };
for (const l of LANGS) {
  out(P.home(l), homePage(l));
  out(P.visaIndex(l), indexPage(l, 'visa'));
  out(P.studyIndex(l), indexPage(l, 'study'));
  out(P.contacts(l), contactsPage(l));
  for (const d of visas[l]) out(P.page(l, d), countryPage(l, d));
  for (const d of study[l]) out(P.page(l, d), countryPage(l, d));
}
writeFile('404.html', notFound());
writeFile('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${abs(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFile('robots.txt', `User-agent: *\nDisallow: /admin/\nSitemap: ${siteUrl}/sitemap.xml\n`);
console.log(`Built ${urls.length} pages → dist/${PREVIEW ? ' (preview links)' : ''}`);
}
