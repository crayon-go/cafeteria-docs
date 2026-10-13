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

if (typeof document !== 'undefined') initSharePage(document, window.location, window.navigator);
