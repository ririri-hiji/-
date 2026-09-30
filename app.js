(() => {
  'use strict';

  const STORAGE_KEY = 'kotobamemo.words';

  const $ = (id) => document.getElementById(id);
  const listView = $('list-view');
  const formView = $('form-view');
  const detailView = $('detail-view');
  const wordList = $('word-list');
  const wordForm = $('word-form');
  const wordInput = $('word-input');
  const meaningInput = $('meaning-input');
  const detailWord = $('detail-word');
  const detailMeaning = $('detail-meaning');
  const sheet = $('sheet');
  const errorBox = $('error');

  // ---------- エラー表示 ----------

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  errorBox.addEventListener('click', () => {
    errorBox.hidden = true;
  });

  // ---------- データ ----------

  // 読み込みに失敗したときは、元のデータを上書きしないよう保存を止める
  let saveBlocked = false;
  let words = load();

  // 端末の空き容量が少ないときなどに、データが自動で消されにくくする
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  function isValidWord(w) {
    return w && typeof w.id === 'string' && typeof w.word === 'string' && typeof w.meaning === 'string';
  }

  function load() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      saveBlocked = true;
      showError('保存データを読み込めませんでした。データを守るため保存を停止しています。アプリを終了して、もう一度開いてください。');
      return [];
    }
    if (raw === null) return []; // まだ何も登録していない

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      // 壊れたデータは下で扱う
    }
    const valid = Array.isArray(data) ? data.filter(isValidWord) : [];
    if (Array.isArray(data) && valid.length === data.length) return valid;

    // 壊れた部分がある場合は、元のデータを別の名前で残してから読める分だけ使う
    try {
      localStorage.setItem(STORAGE_KEY + '.broken.' + Date.now(), raw);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
      showError('保存データの一部が壊れていたため、読み込めた単語だけを表示しています。');
    } catch (e) {
      saveBlocked = true;
      showError('保存データが壊れていて読み込めませんでした。データを守るため保存を停止しています。');
    }
    return valid;
  }

  // 保存に成功したときだけ画面のデータを更新する
  function persist(next) {
    if (saveBlocked) {
      showError('保存データを正しく読み込めなかったため、保存を停止しています。アプリを終了して、もう一度開いてください。');
      return false;
    }
    try {
      const json = JSON.stringify(next);
      localStorage.setItem(STORAGE_KEY, json);
      if (localStorage.getItem(STORAGE_KEY) !== json) throw new Error('verify failed');
      words = next;
      return true;
    } catch (e) {
      showError(e && e.name === 'QuotaExceededError'
        ? '保存できませんでした。保存容量が不足しています。'
        : '保存できませんでした。もう一度お試しください。');
      return false;
    }
  }

  function findWord(id) {
    return words.find((w) => w.id === id);
  }

  // ひらがな・カタカナ・漢字で始まる単語を日本語とみなす
  const JAPANESE = /^[぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ々〆ヶ]/;
  const collator = new Intl.Collator('ja');

  function sorted() {
    return words.slice().sort((a, b) => {
      const ja = JAPANESE.test(a.word.trim());
      const jb = JAPANESE.test(b.word.trim());
      if (ja !== jb) return ja ? -1 : 1; // 日本語以外は下へ
      return collator.compare(a.word, b.word);
    });
  }

  // ---------- 画面切り替え（履歴と連動） ----------

  function render() {
    const state = history.state || {};
    listView.hidden = true;
    formView.hidden = true;
    detailView.hidden = true;
    sheet.hidden = true;

    if (state.view === 'detail') {
      const w = findWord(state.id);
      if (!w) return toList();
      detailWord.textContent = w.word;
      detailMeaning.textContent = w.meaning;
      detailView.hidden = false;
      detailView.scrollTop = 0;
    } else if (state.view === 'form') {
      const w = state.id ? findWord(state.id) : null;
      wordInput.value = w ? w.word : '';
      meaningInput.value = w ? w.meaning : '';
      formView.hidden = false;
      window.scrollTo(0, 0);
    } else if (state.view === 'sheet' && findWord(state.id)) {
      renderList();
      listView.hidden = false;
      sheet.hidden = false;
    } else {
      renderList();
      listView.hidden = false;
    }
  }

  function toList() {
    history.replaceState(null, '');
    render();
  }

  function go(state) {
    history.pushState(state, '');
    render();
  }

  window.addEventListener('popstate', render);

  // ---------- 一覧 ----------

  function renderList() {
    wordList.textContent = '';
    for (const w of sorted()) {
      const li = document.createElement('li');
      li.textContent = w.word;
      li.dataset.id = w.id;
      wordList.appendChild(li);
    }
  }

  // タップで詳細、長押しでメニュー
  let pressTimer = null;
  let longPressed = false;
  let pressX = 0;
  let pressY = 0;

  function cancelPress() {
    clearTimeout(pressTimer);
    pressTimer = null;
  }

  wordList.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    longPressed = false;
    pressX = e.clientX;
    pressY = e.clientY;
    cancelPress();
    pressTimer = setTimeout(() => {
      longPressed = true;
      go({ view: 'sheet', id: li.dataset.id });
    }, 500);
  });

  wordList.addEventListener('pointermove', (e) => {
    if (pressTimer && Math.hypot(e.clientX - pressX, e.clientY - pressY) > 10) {
      cancelPress();
    }
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
    wordList.addEventListener(type, cancelPress);
  });

  wordList.addEventListener('contextmenu', (e) => e.preventDefault());

  wordList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    if (longPressed) {
      longPressed = false;
      return;
    }
    go({ view: 'detail', id: li.dataset.id });
  });

  $('add-btn').addEventListener('click', () => {
    go({ view: 'form', id: null });
    wordInput.focus();
  });

  // ---------- 入力 ----------

  wordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const word = wordInput.value.trim();
    if (!word) {
      wordInput.focus();
      return;
    }
    const meaning = meaningInput.value;
    const state = history.state || {};
    const existing = state.id ? findWord(state.id) : null;

    const next = existing
      ? words.map((w) => (w.id === existing.id ? { ...w, word, meaning } : w))
      : words.concat({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        word,
        meaning,
      });

    // 失敗したときは入力画面に残り、入力内容を失わないようにする
    if (!persist(next)) return;
    wordInput.blur();
    meaningInput.blur();
    history.back();
  });

  // ---------- 長押しメニュー ----------

  $('sheet-edit').addEventListener('click', () => {
    history.replaceState({ view: 'form', id: history.state.id }, '');
    render();
  });

  $('sheet-delete').addEventListener('click', () => {
    const id = history.state.id;
    persist(words.filter((w) => w.id !== id));
    history.back();
  });

  $('sheet-cancel').addEventListener('click', () => history.back());
  $('sheet-backdrop').addEventListener('click', () => history.back());

  // ---------- 詳細（上下スワイプで移動・循環） ----------

  let touchX = 0;
  let touchY = 0;
  let atTop = true;
  let atBottom = true;

  detailView.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touchX = t.clientX;
    touchY = t.clientY;
    atTop = detailView.scrollTop <= 0;
    atBottom = detailView.scrollTop + detailView.clientHeight >= detailView.scrollHeight - 1;
  }, { passive: true });

  detailView.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchX;
    const dy = t.clientY - touchY;
    if (Math.abs(dy) < 50 || Math.abs(dy) < Math.abs(dx)) return;
    // 意味が長くスクロール中のときは、端に達している場合のみ切り替える
    if (dy < 0 && atBottom) step(1);
    else if (dy > 0 && atTop) step(-1);
  });

  function step(delta) {
    const list = sorted();
    const i = list.findIndex((w) => w.id === history.state.id);
    if (i < 0) return;
    const next = list[(i + delta + list.length) % list.length];
    history.replaceState({ view: 'detail', id: next.id }, '');
    render();
  }

  // ---------- 起動 ----------

  render();
})();
