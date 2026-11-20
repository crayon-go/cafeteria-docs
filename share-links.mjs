export const STORE_URL = 'https://play.google.com/store/apps/details?id=com.mintchoco.cafeteria';

export function validCardId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 250 && id !== '.' && id !== '..' && !/[/\\\x00-\x1f\x7f]/.test(id);
}

export function cardIdFromUrl(url) {
  try {
    const values = new URL(url).searchParams.getAll('card');
    return values.length === 1 && validCardId(values[0]) ? values[0] : null;
  } catch { return null; }
}

export function appUrl(id, userAgent) {
  if (!validCardId(id)) throw new Error('Invalid card ID');
  const path = `app/card/${encodeURIComponent(id)}`;
  if (/Android/i.test(userAgent) && !/Firefox/i.test(userAgent)) {
    return `intent://${path}#Intent;scheme=cafeteria;package=com.mintchoco.cafeteria;S.browser_fallback_url=${encodeURIComponent(STORE_URL)};end`;
  }
  return `cafeteria://${path}`;
}

export function initSharePage(document, location, navigator) {
  const id = cardIdFromUrl(location.href);
  const open = document.querySelector('#open-app');
  const title = document.querySelector('#title');
  const message = document.querySelector('#message');
  const status = document.querySelector('#status');
  const copy = document.querySelector('#copy-link');
  if (!id) {
    title.textContent = '식단 주소를 확인해주세요';
    message.textContent = '링크가 빠졌거나 올바르지 않아요. 사진을 보내준 분에게 링크를 다시 받아주세요.';
    open.hidden = true;
    copy.hidden = true;
    return;
  }
  if (/Android/i.test(navigator.userAgent)) {
    open.href = appUrl(id, navigator.userAgent);
    open.hidden = false;
  } else {
    message.textContent = 'Android 휴대폰에서 이 링크를 열면 같은 식단으로 이어져요. 먼저 앱을 설치해두셔도 좋아요.';
  }
  copy.hidden = false;
  copy.addEventListener('click', async () => {
    try {
      const canonical = new URL(location.href);
      canonical.search = '';
      canonical.hash = '';
      canonical.searchParams.set('card', id);
      await navigator.clipboard.writeText(canonical.href);
      status.textContent = '식단 링크를 복사했어요.';
    } catch {
      status.textContent = '주소창의 링크를 길게 눌러 복사해주세요.';
    }
  });
}

// ---- 공유한 식단 미리보기
// 앱이 없는 사람과 아이폰 사용자도 받은 식단의 사진과 점수를 바로 볼 수 있게 한다. 설치 버튼만 있으면 그냥 닫는다.
// 식단 한 장의 공개 값만 돌려주는 서버 함수(functions/src/share.js sharedCard)를 부른다.
// 예전에는 데이터베이스를 직접 읽었는데, 데이터베이스에 앱 확인(App Check)을 강제하면 앱이 아닌 곳의 읽기가 막힌다.

const CARD_API = 'https://asia-northeast3-mintchoco-cafeteria.cloudfunctions.net/sharedCard';
const MEAL_LABELS = { breakfast: '조식', lunch: '중식', dinner: '석식' };

/** 공유 페이지에서 사진을 보여주는 기간(일). 앱이 공유 링크로 받은 식단을 열어 두는 48시간과 맞춘다. */
export const PREVIEW_DAYS = 2;

export function cardApiUrl(id) {
  if (!validCardId(id)) throw new Error('Invalid card ID');
  return `${CARD_API}?card=${encodeURIComponent(id)}`;
}

/** 한국 시간 기준 YYYY-MM-DD. */
export function kstDateKey(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

function addDays(dateKey, days) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 서버가 준 식단 값을 화면에 쓸 값으로 바꾼다. 필요한 값이 없거나 모양이 다르면 null. */
export function parseCard(data) {
  const text = (key) => (typeof data?.[key] === 'string' ? data[key] : '');
  const imageUrl = text('imageUrl');
  if (!text('company') || !/^https:\/\//.test(imageUrl) || !/^\d{4}-\d{2}-\d{2}$/.test(text('dateKey'))) return null;
  const corner = text('corner');
  const meal = MEAL_LABELS[text('meal')] ?? '';
  return {
    company: text('company'),
    imageUrl,
    dateKey: text('dateKey'),
    mealCorner: corner && corner !== '기본' ? `${meal} ${corner}` : meal,
    score: typeof data.score === 'number' && Number.isFinite(data.score) ? Math.round(data.score) : null,
    menus: (Array.isArray(data.menus) ? data.menus : []).filter((m) => typeof m === 'string' && m).slice(0, 6),
  };
}

/** 사진을 보여줄 만큼 최근 식단인지. 오래된 식단은 앱에서 여는 방법을 안내한다. */
export function isRecent(dateKey, today = kstDateKey()) {
  return dateKey >= addDays(today, -PREVIEW_DAYS);
}

/** 받은 식단의 사진, 회사, 점수, 메뉴를 페이지에 그린다. 읽지 못하면 원래 안내 화면을 그대로 둔다. */
export async function showSharedCard(document, id, { fetch = globalThis.fetch, today = kstDateKey() } = {}) {
  const box = document.querySelector('#card');
  if (!id || !box || !fetch) return false;
  try {
    const res = await fetch(cardApiUrl(id));
    if (!res.ok) return false;
    const card = parseCard(await res.json());
    if (!card || !isRecent(card.dateKey, today)) return false;
    const photo = document.querySelector('#card-photo');
    photo.src = card.imageUrl;
    photo.alt = `${card.company} ${card.mealCorner} 식단 사진`;
    document.querySelector('#card-company').textContent = card.company;
    document.querySelector('#card-meta').textContent = [card.dateKey, card.mealCorner].filter(Boolean).join(' ');
    const score = document.querySelector('#card-score');
    score.textContent = card.score == null ? '' : `식단 점수 ${card.score}점`;
    score.hidden = card.score == null;
    document.querySelector('#card-menus').textContent = card.menus.join(', ');
    box.hidden = false;
    // 사진이 보이면 캐릭터 그림과 큰 제목은 자리를 내준다.
    const mascot = document.querySelector('#mascot');
    if (mascot) mascot.hidden = true;
    document.querySelector('#title').textContent = '보내준 식단이에요';
    document.querySelector('#message').textContent = '앱에서 다른 사람들의 반응과 댓글, 다른 회사 식단도 구경해보세요.';
    return true;
  } catch {
    return false;
  }
}

if (typeof document !== 'undefined') {
  initSharePage(document, window.location, window.navigator);
  showSharedCard(document, cardIdFromUrl(window.location.href));
}
