// 共用儲存模組：私人版與工作版都用這一份。
// 原則：資料正本是 iCloud 資料夾裡的 JSON（原型/data/*.json），瀏覽器 localStorage 只是快取。
// 第一次要按「連結資料夾」選 原型/data，授權會記在 IndexedDB，之後開啟只要按一下「重新連結」（瀏覽器規定每次工作階段要使用者點一下）。
// 兩個版本在 file:// 下共用同一個 origin，所以資料夾只要連結一次，兩邊都能用。
// Safari 沒有這個 API，退回「匯出／匯入 JSON」。

const VaultStore = (() => {
  const DB = 'workbench-vault', STORE = 'handles', KEY = 'dir';
  const supported = 'showDirectoryPicker' in window && !!window.indexedDB;
  let dir = null, cfg = null, lastModified = 0, timer = null, status = { state: 'none', note: '' };

  const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const getHandle = async () => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY); t.onsuccess = () => res(t.result || null); t.onerror = () => rej(t.error); }); };
  const setHandle = async h => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite').objectStore(STORE); const q = h ? t.put(h, KEY) : t.delete(KEY); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); };
  const clock = () => new Date().toTimeString().slice(0, 5);

  async function permission(h, ask) {
    if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    if (!ask) return false;
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
  }
  async function readFile() {
    try {
      const fh = await dir.getFileHandle(cfg.filename); const f = await fh.getFile();
      lastModified = f.lastModified; const text = await f.text();
      return text.trim() ? JSON.parse(text) : null;
    } catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
  }
  async function writeFile(data) {
    const fh = await dir.getFileHandle(cfg.filename, { create: true });
    const w = await fh.createWritable(); await w.write(JSON.stringify(data, null, 2)); await w.close();
    lastModified = (await fh.getFile()).lastModified;
  }

  // 啟動：有授權就讀檔；檔案不存在就用目前的瀏覽器資料建立
  async function boot(ask) {
    if (!supported) return setStatus('unsupported');
    try {
      dir = dir || await getHandle();
      if (!dir) return setStatus('none');
      if (!(await permission(dir, ask))) return setStatus('need-permission');
      const data = await readFile();
      if (data) { cfg.set(data); setStatus('ready', '已從資料夾讀取'); }
      else { await writeFile(cfg.get()); setStatus('ready', '已建立 ' + cfg.filename); }
    } catch (e) { console.error(e); setStatus('error', e.message); }
  }
  async function connect() {
    try {
      dir = await showDirectoryPicker({ id: 'workbench-data', mode: 'readwrite' });
      await setHandle(dir); await boot(true);
    } catch (e) { if (e.name !== 'AbortError') { console.error(e); setStatus('error', e.message); } }
  }
  async function disconnect() { dir = null; await setHandle(null); setStatus('none'); }

  // 存檔：app 每次 save() 呼叫，300ms 內多次只寫一次
  function save() {
    if (status.state !== 'ready') return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { await writeFile(cfg.get()); setStatus('ready', '已儲存 ' + clock()); }
      catch (e) { console.error(e); setStatus('error', '寫入失敗：' + e.message); }
    }, 300);
  }
  // 另一台電腦改過檔案（iCloud 同步進來）：視窗回到前景時比對修改時間
  async function pullIfChanged() {
    if (status.state !== 'ready') return;
    try {
      const f = await (await dir.getFileHandle(cfg.filename)).getFile();
      if (f.lastModified > lastModified) { lastModified = f.lastModified; const text = await f.text(); if (text.trim()) { cfg.set(JSON.parse(text)); setStatus('ready', '已同步外部修改 ' + clock()); } }
    } catch (e) { console.error(e); }
  }

  // 備援：匯出／匯入 JSON 檔
  function exportJson() {
    const blob = new Blob([JSON.stringify(cfg.get(), null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: cfg.filename.replace('.json', '') + '-' + new Date().toISOString().slice(0, 10) + '.json' });
    a.click(); URL.revokeObjectURL(a.href);
  }
  function importJson() {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' });
    input.onchange = async () => {
      const f = input.files[0]; if (!f) return;
      try { const data = JSON.parse(await f.text()); if (!confirm('用「' + f.name + '」取代目前所有資料？')) return; cfg.set(data); cfg.afterImport?.(); save(); setStatus(status.state, '已匯入 ' + f.name); }
      catch (e) { alert('讀不懂這個檔案：' + e.message); }
    };
    input.click();
  }

  // 狀態列：顯示目前資料在哪、提供對應的按鈕
  function setStatus(state, note = '') {
    status = { state, note };
    if (!cfg?.el) return;
    const btn = (act, text, cls = '') => `<button type="button" data-store="${act}" class="${cls}">${text}</button>`;
    const text = {
      unsupported: '資料只在此瀏覽器（此瀏覽器不支援連結資料夾）',
      none: '資料只在此瀏覽器',
      'need-permission': '資料夾待授權',
      ready: `已連結「${dir?.name || ''}」${note ? ' · ' + note : ''}`,
      error: '資料夾錯誤' + (note ? '：' + note : ''),
    }[state];
    const actions = {
      unsupported: btn('export', '匯出') + btn('import', '匯入'),
      none: btn('connect', '連結 iCloud 資料夾', 'hi') + btn('export', '匯出') + btn('import', '匯入'),
      'need-permission': btn('reconnect', '重新連結', 'hi') + btn('export', '匯出'),
      ready: btn('export', '匯出') + btn('import', '匯入') + btn('disconnect', '中斷'),
      error: btn('reconnect', '重試', 'hi') + btn('connect', '換資料夾') + btn('export', '匯出'),
    }[state];
    cfg.el.className = 'local store-' + state;
    cfg.el.innerHTML = `<span class="store-text">● ${text}</span>${actions}`;
  }

  // app 端只要呼叫這一個：el 是狀態列容器、filename 是檔名、get/set 是取得與覆寫 state 的函式
  function attach(options) {
    cfg = options;
    cfg.el.addEventListener('click', e => {
      const act = e.target.closest('[data-store]')?.dataset.store; if (!act) return;
      ({ connect, reconnect: () => boot(true), disconnect, export: exportJson, import: importJson })[act]();
    });
    window.addEventListener('focus', pullIfChanged);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pullIfChanged(); });
    boot(false);
  }

  return { attach, save, supported, get status() { return status; } };
})();
