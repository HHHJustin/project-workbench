// 工作版專案管理原型：純前端、虛構資料、localStorage。
// 三層資料結構：骨幹（專案、範圍、里程碑、協作對象）→ 追蹤（任務、待確認、變更、決策、風險）→ 階段物件（每階段的文件、要做的事、功能清單、出口條件）。
// 2026-11-09 起階段本身可編輯：改名、改出口條件、新增、刪除、排序；範本只是起點，不是限制。

const KEY = 'work-project-v1';
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => localISO(new Date());
// 本週日（含）：燈號規則裡「本週內到期」的邊界
const weekEnd = () => { const d = new Date(); d.setDate(d.getDate() + (6 - (d.getDay() + 6) % 7)); return localISO(d); };
// 燈號：紅＝今天到期或已過期、黃＝本週內、綠＝還有時間、空＝沒設期限；完成的不亮
const lightOf = (due, done) => done ? 'off' : !due ? 'none' : due <= today() ? 'red' : due <= weekEnd() ? 'amber' : 'green';
const LIGHT_LABEL = { red: '今天到期或已過期', amber: '本週內到期', green: '還有時間', none: '沒設期限', off: '' };
const light = (due, done) => { const l = lightOf(due, done); return l === 'off' ? '' : `<span class="light ${l}" title="${LIGHT_LABEL[l]}${due ? ' · ' + due : ''}"></span>`; };
// 一個專案裡紅燈與黃燈各幾個：任務（你看得到的）＋要做的事（內部才算）＋里程碑
function lightCounts(p) {
  const items = [...visibleTasks(p).map(t => lightOf(t.due, t.status === 'done')), ...(can('checklist') ? p.stages.flatMap(s => s.checklist).map(c => lightOf(c.due, c.done)) : []), ...p.milestones.map(m => lightOf(m.date, m.done))];
  return { red: items.filter(l => l === 'red').length, amber: items.filter(l => l === 'amber').length };
}
const lightsBadge = ({ red, amber }) => (red || amber) ? `<span class="lights" title="紅：今天到期或已過期 ${red}；黃：本週內到期 ${amber}">${red ? `<span class="light red"></span>${red}` : ''}${amber ? `<span class="light amber"></span>${amber}` : ''}</span>` : '';

// 階段範本：不同案型的階段不一樣（切版案沒有我方設計階段），所以用範本生成，不寫死。
// 文件的 owner 決定「誰要交」：client 代表客戶提供，我方只需確認收到。
// checklist 是這個階段「要做的事」的預設清單，建案後可以自由增刪；功能清單依專案不同，範本不預設。
const TEMPLATES = {
  standard: {
    name: '標準流程（九階段）',
    hint: '依公司 PM 流程規範的九個檢查點：規劃、客戶合約、供應商合約、Kick off、需求訪談、SOW 定案、設計、開發測試、驗收結案。',
    stages: [
      { id: 'plan', name: '初步規劃', exit: '功能清單、WBS、Sitemap 初版完成', docs: [{ name: '功能清單（初版）', owner: 'ours', vis: [] }, { name: 'WBS／甘特圖（初版）', owner: 'ours', vis: [] }, { name: 'Sitemap（初版）', owner: 'ours', vis: ['client'] }], checklist: ['接獲任務後 3 個工作日內完成初版功能清單、WBS、Sitemap'] },
      { id: 'contract', name: '客戶合約', exit: '客戶合約簽署', docs: [{ name: '報價單', owner: 'ours', vis: ['client'] }, { name: '客戶合約', owner: 'ours', vis: ['client'] }], checklist: ['客戶資料表／工商查核', '合約健檢後送簽'] },
      { id: 'vendor', name: '供應商合約', exit: '供應商合約用印完成（客戶合約先簽）', docs: [{ name: '供應商評選紀錄', owner: 'ours', vis: [] }, { name: '供應商報價單', owner: 'vendor', vis: ['vendor'] }, { name: '供應商合約', owner: 'ours', vis: ['vendor'] }], checklist: ['確認客戶合約已簽，再啟動供應商合約'] },
      { id: 'kickoff', name: 'Kick off', exit: '內外部 Kick off 完成並發出會議記錄', docs: [{ name: '內部 Kick off 簡報', owner: 'ours', vis: [] }, { name: '內部 Kick off 會議記錄', owner: 'ours', vis: [] }, { name: '外部 Kick off 簡報', owner: 'ours', vis: ['client'] }, { name: '外部 Kick off 會議記錄', owner: 'ours', vis: ['client'] }], checklist: ['Kick off 前 2 天備妥簡報', '內部 Kick off 後 4～7 個工作日辦外部 Kick off', '會後 2 個工作日內發會議記錄'] },
      { id: 'req', name: '需求訪談', exit: '各場次訪談完成、需求追溯表更新', docs: [{ name: '需求追溯表', owner: 'ours', vis: [] }, { name: '訪談議題表', owner: 'ours', vis: ['client'] }, { name: '訪談會議記錄', owner: 'ours', vis: ['client'] }], checklist: ['訪談前 1 天完成需求追溯表', '各場次訪前 2 天備妥議題表', '會後 2 個工作日內發會議記錄'] },
      { id: 'sow', name: 'SOW／功能清單定案', exit: '功能清單定版、SOW 客戶確認', docs: [{ name: '功能清單（定版）', owner: 'ours', vis: ['client', 'vendor'] }, { name: 'SOW', owner: 'ours', vis: ['client'] }, { name: 'SA 系統分析書', owner: 'vendor', vis: ['vendor'] }, { name: '任務分派紀錄', owner: 'ours', vis: [] }], checklist: ['訪談全部完成後 2 天內功能清單定版', '訪談結束後 5 個工作天內完成 SOW（含 1 天內部審核）', '功能清單定版後 1 天內完成任務分派'] },
      { id: 'design', name: 'UX／UI 設計', exit: '客戶簽核設計稿', docs: [{ name: 'Wireframe', owner: 'ours', vis: ['client'] }, { name: 'UI 精稿', owner: 'ours', vis: ['client', 'vendor'] }, { name: '設計階段驗收單', owner: 'client', vis: ['client'] }], checklist: ['任務到期前 2 天完成設計稿', '設計稿送客戶簽核'] },
      { id: 'dev', name: '開發／測試（SIT）', exit: '功能完成、SIT 通過', docs: [{ name: '架構決策文件', owner: 'vendor', vis: ['vendor'] }, { name: 'Test Case', owner: 'vendor', vis: ['client', 'vendor'] }, { name: 'SIT 測試報告', owner: 'vendor', vis: ['client'] }, { name: 'Bug 清單', owner: 'ours', kind: 'notion', vis: ['client', 'vendor'] }], checklist: ['SIT 開始前 7 個工作日收到供應商 Test Case', '每週一 Review 前更新 WBS／進度'] },
      { id: 'accept', name: '驗收／結案', exit: '客戶簽收驗收單、資料夾歸檔', docs: [{ name: 'UAT 紀錄', owner: 'ours', kind: 'notion', vis: ['client'] }, { name: 'SA 規格（終版）', owner: 'vendor', vis: ['client'] }, { name: 'API 文件', owner: 'vendor', vis: ['client'] }, { name: 'DB 文件', owner: 'vendor', vis: ['client'] }, { name: '操作手冊', owner: 'vendor', vis: ['client'] }, { name: '驗收單', owner: 'client', vis: ['client'] }], checklist: ['交付前 2 日備齊驗收文件', '上線後 30 天觀察期無重大瑕疵再簽驗收單', '結案：資料夾歸檔、狀態轉完成'] },
    ],
  },
  frontend: {
    name: '切版案（客戶提供設計）',
    hint: '適合純前端切版：設計稿由客戶提供，沒有我方設計階段。',
    stages: [
      { id: 'req', name: '需求確認', exit: '客戶確認需求清單與交付範圍', docs: [{ name: '需求清單', owner: 'ours', vis: ['client'] }, { name: '設計稿（Figma）', owner: 'client', vis: ['client'] }], checklist: ['整理客戶提供的設計稿與頁面清單', '確認交付格式（純 HTML 或框架）'] },
      { id: 'quote', name: '報價與合約', exit: '報價同意、合約或平台訂單成立', docs: [{ name: '報價單', owner: 'ours', vis: ['client'] }], checklist: ['送出報價單', '確認付款節點'] },
      { id: 'dev', name: '切版開發', exit: '所有頁面完成，內部檢查通過', docs: [{ name: '字體與素材對照表', owner: 'ours', vis: ['client'] }], checklist: ['建立專案骨架與共用樣式', '逐頁切版', '跨瀏覽器與裝置檢查'] },
      { id: 'uat', name: '測試驗收', exit: '客戶完成驗收、Bug 清單全數關閉', docs: [{ name: 'Bug 清單', owner: 'ours', kind: 'notion', vis: ['client'] }, { name: '驗收紀錄', owner: 'ours', kind: 'notion', vis: ['client'] }], checklist: ['部署測試網址給客戶', '逐條關閉 Bug 清單'] },
      { id: 'handoff', name: '交付', exit: '原始碼與部署說明送出、客戶簽收', docs: [{ name: '完整原始碼', owner: 'ours', vis: ['client'] }, { name: '部署說明', owner: 'ours', vis: ['client'] }], checklist: ['整理原始碼與部署說明', '取得客戶簽收'] },
    ],
  },
  system: {
    name: '系統開發案',
    hint: '完整六階段：需求、規劃、設計、開發、驗收、上線。',
    stages: [
      { id: 'req', name: '需求訪談', exit: '客戶確認需求清單', docs: [{ name: '訪談紀錄', owner: 'ours', vis: [] }, { name: '需求清單', owner: 'ours', vis: ['client'] }], checklist: ['安排訪談', '整理需求清單送客戶確認'] },
      { id: 'plan', name: '規劃提案', exit: '合約簽署', docs: [{ name: 'SOW', owner: 'ours', vis: ['client'] }, { name: 'WBS', owner: 'ours', vis: [] }, { name: '報價單', owner: 'ours', vis: ['client'] }], checklist: ['撰寫 SOW 與 WBS', '報價與合約簽署'] },
      { id: 'design', name: '設計', exit: '客戶簽核設計稿', docs: [{ name: 'Wireframe', owner: 'ours', vis: ['client'] }, { name: 'UI 稿', owner: 'ours', vis: ['client'] }, { name: '設計規範', owner: 'ours', vis: ['vendor'] }], checklist: ['Wireframe 確認流程', 'UI 稿送客戶簽核'] },
      { id: 'dev', name: '開發', exit: '功能完成並通過內部測試', docs: [{ name: '規格文件', owner: 'ours', vis: ['vendor'] }, { name: 'API 文件', owner: 'vendor', vis: ['vendor'] }, { name: '測試案例', owner: 'ours', vis: ['vendor'] }], checklist: ['拆功能清單給供應商', '每週檢視進度', '內部測試'] },
      { id: 'uat', name: '測試驗收', exit: '客戶驗收簽核', docs: [{ name: '測試報告', owner: 'ours', vis: ['client'] }, { name: 'Bug 清單', owner: 'ours', kind: 'notion', vis: ['client', 'vendor'] }, { name: 'UAT 紀錄', owner: 'ours', kind: 'notion', vis: ['client'] }], checklist: ['準備測試資料與案例', '陪客戶走 UAT', 'Bug 全數關閉'] },
      { id: 'launch', name: '上線維運', exit: '正式交付、保固條款生效', docs: [{ name: '部署文件', owner: 'ours', vis: ['vendor'] }, { name: '交接文件', owner: 'ours', vis: ['client'] }, { name: '保固條款', owner: 'ours', vis: ['client'] }], checklist: ['部署正式環境', '交接文件與保固條款生效'] },
    ],
  },
};

// 權限矩陣集中在這裡，之後正式版搬到服務端時照抄即可。
// 客戶看得到目標、範圍、里程碑、文件狀態、功能清單、待確認、變更；看不到內部任務、要做的事、決策、風險。
// 供應商只看自己的任務、功能清單和標記給供應商的文件。
const ROLE = {
  owner:  { label: '專案負責人', edit: true,  scope: true, people: true, tasks: 'all',    confirms: true, changes: true, decisions: true, risks: true, checklist: true },
  member: { label: '內部同事',   edit: true,  scope: true, people: true, tasks: 'all',    confirms: true, changes: true, decisions: true, risks: true, checklist: true },
  client: { label: '客戶',       edit: false, scope: true, people: false, tasks: 'client', confirms: true, changes: true, decisions: false, risks: false, checklist: false },
  vendor: { label: '供應商',     edit: false, scope: false, people: false, tasks: 'vendor', confirms: false, changes: false, decisions: false, risks: false, checklist: false },
};
const DOC_STATUS = { na: '尚未開始', draft: '草稿', review: '送審', confirmed: '已確認' };
const TASK_STATUS = { todo: '待辦', doing: '進行中', done: '完成' };
const FEATURE_STATUS = { todo: '待做', doing: '進行中', done: '完成' };
const QUOTE = { pending: '待報價', quoted: '已報價', agreed: '已同意', declined: '不做' };
const LEVEL = { low: '低', mid: '中', high: '高' };
const SIDE = { internal: '內部', client: '客戶', vendor: '供應商' };

function buildStages(templateKey) {
  return TEMPLATES[templateKey].stages.map(s => ({
    id: s.id, name: s.name, exit: s.exit,
    docs: s.docs.map(d => ({ id: uid(), name: d.name, owner: d.owner, kind: d.kind || 'file', status: 'na', url: '', vis: [...d.vis], confirmedOn: '' })),
    checklist: (s.checklist || []).map(text => ({ id: uid(), text, done: false, due: '' })),
    features: [], enteredOn: '', doneOn: '',
    gate: { docs: true, checklist: false, features: false }, // 推進條件：預設只要求我方文件全部確認
    status: 'todo',
  }));
}

// 虛構示例資料：兩個案子，一個切版案走到驗收、一個系統案在開發中，用來比較兩種範本與角色視圖。
function initial() {
  const p1 = {
    id: 'p1', name: '某美容連鎖 服務報到機台網頁', client: '某美容連鎖', owner: '夜夜', start: '2026-05-20', due: '2026-07-05',
    template: 'frontend', stageIndex: 3,
    goal: '到店顧客在機台自助輸入預約代碼與手機完成報到，領取號碼牌，減少櫃台排隊。',
    scopeIn: ['四頁 kiosk 流程切版（歡迎、報到、確認、號碼牌）', '固定畫布 1194×834', '虛擬鍵盤與示意驗證'],
    scopeOut: ['預約代碼真實查詢', '會員資料帶入', '系統發號與後端串接'],
    people: [{ id: 'u1', name: '夜夜', side: 'internal', role: '負責人／切版' }, { id: 'u2', name: '客戶窗口 A', side: 'client', role: '需求與驗收' }],
    milestones: [{ id: 'm1', name: '初次提案', date: '2026-06-02', done: true }, { id: 'm2', name: '最後交件', date: '2026-07-01', done: false }],
    stages: buildStages('frontend'),
    tasks: [
      { id: 't1', name: '四頁切版完成', assignee: 'u1', due: '2026-06-20', stage: 'dev', status: 'done', vis: ['client'] },
      { id: 't2', name: '打包最終 zip 與部署說明', assignee: 'u1', due: '2026-06-28', stage: 'handoff', status: 'doing', vis: [] },
      { id: 't3', name: '客戶提供正式背景圖', assignee: 'u2', due: '2026-06-25', stage: 'uat', status: 'todo', vis: ['client'] },
    ],
    confirms: [
      { id: 'c1', text: '是否需要後端串接（預約碼查詢、會員帶入、系統發號）？影響是否進入下一階段與加價。', askedOn: '2026-06-18', status: 'open' },
      { id: 'c2', text: '背景圖目前為暫代圖，請提供正式素材。', askedOn: '2026-06-18', status: 'open' },
      { id: 'c3', text: '標籤字重「中-粗」疑非 Noto Sans TC，請提供字體檔。', askedOn: '2026-06-18', status: 'open' },
      { id: 'c4', text: '機台實際裝置是否為 iPad？', askedOn: '2026-06-18', status: 'answered' },
    ],
    changes: [{ id: 'ch1', text: '後端串接：預約碼真實查詢、會員資料帶入、系統發號', by: '客戶窗口 A', date: '2026-06-18', quote: 'pending' }],
    decisions: [
      { id: 'd1', text: '歡迎頁標題採用辰宇落雁體（OFL 開源，本地 ttf）', by: '夜夜', date: '2026-06-05' },
      { id: 'd2', text: '示意驗證用寫死的測試帳號，正式版待客戶決定是否串後端', by: '夜夜', date: '2026-06-10' },
    ],
    risks: [{ id: 'r1', text: '客戶可能期待後端功能包含在原報價內', level: 'mid', by: '夜夜', date: '2026-06-18', status: 'open' }],
  };
  const p2 = {
    id: 'p2', name: '某零售業 會員系統改版', client: '某零售業', owner: '夜夜', start: '2026-09-01', due: '2027-01-31',
    template: 'system', stageIndex: 3,
    goal: '整合線上線下會員資料，讓門市與官網共用同一套點數與等級規則。',
    scopeIn: ['會員資料整合', '點數與等級規則引擎', '後台管理介面'],
    scopeOut: ['CRM 行銷自動化', 'POS 硬體更換'],
    people: [
      { id: 'u1', name: '夜夜', side: 'internal', role: 'PM' }, { id: 'u3', name: '同事 B', side: 'internal', role: 'UI 設計' },
      { id: 'u4', name: '客戶窗口 C', side: 'client', role: '資訊部' }, { id: 'u5', name: '後端外包團隊', side: 'vendor', role: 'API 開發' },
    ],
    milestones: [{ id: 'm1', name: '合約簽署', date: '2026-09-15', done: true }, { id: 'm2', name: '設計簽核', date: '2026-10-20', done: true }, { id: 'm3', name: 'UAT 開始', date: '2026-12-10', done: false }, { id: 'm4', name: '正式上線', date: '2027-01-25', done: false }],
    stages: buildStages('system'),
    tasks: [
      { id: 't1', name: '會員 API 規格文件 v2', assignee: 'u1', due: '2026-11-12', stage: 'dev', status: 'doing', vis: ['vendor'] },
      { id: 't2', name: '點數規則 API 實作', assignee: 'u5', due: '2026-11-30', stage: 'dev', status: 'doing', vis: ['vendor'] },
      { id: 't3', name: '後台列表頁 UI 微調', assignee: 'u3', due: '2026-11-14', stage: 'dev', status: 'todo', vis: [] },
      { id: 't4', name: '提供門市測試資料', assignee: 'u4', due: '2026-11-20', stage: 'uat', status: 'todo', vis: ['client'] },
    ],
    confirms: [{ id: 'c1', text: '等級降級規則：逾期未消費是否立即降級，還是保留一個月緩衝？', askedOn: '2026-11-03', status: 'open' }],
    changes: [{ id: 'ch1', text: '新增生日禮推播', by: '客戶窗口 C', date: '2026-10-28', quote: 'quoted' }],
    decisions: [{ id: 'd1', text: '點數計算放後端，前端只顯示，避免門市與官網算法不一致', by: '夜夜', date: '2026-10-08' }],
    risks: [{ id: 'r1', text: '客戶測試資料延遲會壓縮 UAT 時間', level: 'high', by: '夜夜', date: '2026-11-05', status: 'open' }],
  };
  // 示例文件狀態：讓畫面一開就看得出「已確認／送審／草稿」長什麼樣
  const set = (p, stageId, name, patch) => Object.assign(p.stages.find(s => s.id === stageId).docs.find(d => d.name === name), patch);
  set(p1, 'req', '需求清單', { status: 'confirmed' }); set(p1, 'req', '設計稿（Figma）', { status: 'confirmed', url: 'https://www.figma.com/', confirmedOn: '2026-05-25' });
  set(p1, 'quote', '報價單', { status: 'confirmed' }); set(p1, 'dev', '字體與素材對照表', { status: 'confirmed' });
  set(p1, 'uat', 'Bug 清單', { status: 'draft', url: 'https://www.notion.so/' }); set(p1, 'handoff', '部署說明', { status: 'draft' });
  set(p2, 'req', '需求清單', { status: 'confirmed' }); set(p2, 'plan', 'SOW', { status: 'confirmed' }); set(p2, 'plan', '報價單', { status: 'confirmed' });
  set(p2, 'design', 'UI 稿', { status: 'confirmed' }); set(p2, 'dev', '規格文件', { status: 'review' }); set(p2, 'dev', 'API 文件', { status: 'draft' });
  // 示例「要做的事」與「功能清單」：走過的階段全部打勾，開發階段放幾個功能看狀態長什麼樣
  for (const p of [p1, p2]) p.stages.slice(0, p.stageIndex).forEach(s => s.checklist.forEach(c => c.done = true));
  const dates = (p, list) => list.forEach(([entered, done], i) => Object.assign(p.stages[i], { enteredOn: entered, doneOn: done }));
  dates(p1, [['2026-05-20', '2026-05-27'], ['2026-05-27', '2026-06-02'], ['2026-06-02', '2026-06-20'], ['2026-06-20', '']]);
  dates(p2, [['2026-09-01', '2026-09-10'], ['2026-09-10', '2026-09-15'], ['2026-09-15', '2026-10-20'], ['2026-10-20', '']]);
  for (const p of [p1, p2]) p.stages.forEach(s => s.docs.forEach(d => { if (d.status === 'confirmed') d.confirmedOn = s.doneOn || s.enteredOn; }));
  p1.stages[3].checklist[0].done = true;
  p1.stages[3].checklist[1].due = '2026-06-30';
  p2.stages[3].checklist.forEach((c, i) => c.due = ['2026-11-14', '2026-11-28', '2026-12-05'][i]);
  p2.stages[3].gate = { docs: true, checklist: true, features: true };
  const feat = (text, status) => ({ id: uid(), text, status });
  p1.stages.find(s => s.id === 'dev').features = [feat('歡迎頁', 'done'), feat('報到輸入頁（預約碼＋手機）', 'done'), feat('確認頁', 'done'), feat('號碼牌頁', 'done'), feat('虛擬鍵盤', 'done')];
  p2.stages.find(s => s.id === 'dev').features = [feat('會員資料整合 API', 'doing'), feat('點數規則引擎', 'doing'), feat('等級升降規則', 'todo'), feat('後台會員列表與查詢', 'todo'), feat('後台手動調整點數', 'todo')];
  for (const p of [p1, p2]) p.stages.forEach((s, i) => s.status = i < p.stageIndex ? 'done' : i === p.stageIndex ? 'doing' : 'todo');
  // 示例迭代：系統案的開發階段跑兩週一個 Sprint
  const dev = p2.stages.find(s => s.id === 'dev');
  dev.sprints = [
    { id: 'sp1', name: 'Sprint 1', start: '2026-10-20', end: '2026-11-02', goal: '會員資料整合 API 可在測試環境呼叫', status: 'done' },
    { id: 'sp2', name: 'Sprint 2', start: '2026-11-03', end: '2026-11-16', goal: '點數規則引擎與後台列表頁可給客戶試用', status: 'doing' },
    { id: 'sp3', name: 'Sprint 3', start: '2026-11-17', end: '2026-11-30', goal: '等級升降規則與整合測試', status: 'todo' },
  ];
  Object.assign(p2.tasks.find(t => t.id === 't1'), { sprint: 'sp1' }); Object.assign(p2.tasks.find(t => t.id === 't2'), { sprint: 'sp2' }); Object.assign(p2.tasks.find(t => t.id === 't3'), { sprint: 'sp2' });
  return { projects: [p1, p2] };
}

// 階段狀態：每個階段各自是 todo／doing／done，可以同時好幾個「進行中」（例如上線送審與弱掃並行）。
// p.stageIndex 只是「主要階段」，由狀態推算，留著給同步腳本與舊程式用。
const STAGE_STATUS = { todo: '尚未開始', doing: '進行中', done: '已完成' };
// 迭代：Sprint 掛在階段底下（不另開階段），只有開啟過的階段才顯示。任務用 task.sprint 指向 Sprint id。
const allSprints = p => p.stages.flatMap(s => (s.sprints || []).map(sp => ({ ...sp, stageId: s.id, stageName: s.name })));
const findSprint = (p, id) => { for (const s of p.stages) { const sp = (s.sprints || []).find(x => x.id === id); if (sp) return { s, sp }; } };
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return localISO(d); };
const sprintRange = sp => sp.start || sp.end ? `${fmtDate(sp.start)}–${fmtDate(sp.end)}` : '未排日期';
const activeStages = p => p.stages.filter(s => s.status === 'doing');
const primaryIndex = p => { const i = p.stages.findIndex(s => s.status === 'doing'); if (i > -1) return i; const j = p.stages.findIndex(s => s.status !== 'done'); return j > -1 ? j : p.stages.length - 1; };
const activeNames = p => { const a = activeStages(p); return a.length ? a.map(s => s.name).join('、') : (p.stages.every(s => s.status === 'done') ? '全部完成' : '尚未開始'); };
const doneCount = p => p.stages.filter(s => s.status === 'done').length;
const syncPrimary = p => { p.stageIndex = primaryIndex(p); };
// 舊資料補欄位：11-09 以前存的專案沒有 checklist／features／日期／推進條件／階段狀態
function normalize(data) {
  if (!data || !Array.isArray(data.projects)) return initial();
  for (const p of data.projects) { p.stages.forEach(s => { s.sprints ??= []; }); p.stages.forEach((s, i) => { s.status ??= i < (p.stageIndex ?? 0) ? 'done' : i === (p.stageIndex ?? 0) ? 'doing' : 'todo'; }); syncPrimary(p); }
  for (const p of data.projects) for (const s of p.stages) if (s.seed) {
    const t = TEMPLATES[s.seed.template]?.stages[s.seed.index];
    if (t) { s.exit ||= t.exit; s.docs = t.docs.map(d => ({ id: uid(), name: d.name, owner: d.owner, kind: d.kind || 'file', status: 'na', url: '', vis: [...d.vis], confirmedOn: '' })); s.checklist = (t.checklist || []).map(text => ({ id: uid(), text, done: false, due: '' })); }
    delete s.seed;
  }
  for (const p of data.projects) for (const s of p.stages) { s.checklist ??= []; s.features ??= []; s.enteredOn ??= ''; s.doneOn ??= ''; s.gate ??= { docs: true, checklist: false, features: false }; s.docs.forEach(d => d.confirmedOn ??= ''); s.checklist.forEach(c => c.due ??= ''); }
  return data;
}
let state;
try { state = normalize(JSON.parse(localStorage.getItem(KEY))); } catch { state = initial(); }
let role = 'owner', currentId = null, currentTab = 'summary', selectedStage = null, editing = null, meeting = false, showDone = false, sprintFilter = '';

const stamp = () => new Date().toISOString();
// 時間顯示：今天只顯示時分，其他日子加月日
const fmtTime = iso => { if (!iso) return '—'; const d = new Date(iso); const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; return localISO(d) === today() ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`; };
function save() { const p = project(); if (p) { p.updatedAt = stamp(); syncPrimary(p); } try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { alert('瀏覽器無法保存資料。'); } VaultStore.save(); }
const project = () => state.projects.find(p => p.id === currentId);
const can = key => ROLE[role][key];
const personName = (p, id) => p.people.find(u => u.id === id)?.name || '未指定';
const personSide = (p, id) => p.people.find(u => u.id === id)?.side || 'internal';
const visibleFor = r => item => r === 'owner' || r === 'member' || item.vis.includes(r);
const visible = item => visibleFor(role)(item);
// 供應商只看自己人負責的任務或被標記給供應商的任務；客戶只看標記給客戶的
const visibleTasks = p => { const mode = can('tasks'); return p.tasks.filter(t => mode === 'all' || t.vis.includes(mode) || personSide(p, t.assignee) === mode); };
const fmtDate = s => s ? s.slice(5).replace('-', '/') : '—';
// 跟上次同步到 Notion 的值比，有不同就代表還沒推出去（欄位與同步腳本一致）
const notionDirty = t => { if (!t.sync) return false; const s = t.notion?.synced; if (!s) return true; const p = project(); const owner = p?.people.find(u => u.id === t.assignee)?.name || ''; const v = { name: t.name || '', owner, done: t.status === 'done', due: t.due || '', dueStart: t.dueStart || '', dueNote: t.dueNote || '', basis: t.basis || '', note: t.note || '', confirmBy: t.confirmBy || '' }; return Object.keys(v).some(k => (v[k] ?? '') !== (s[k] ?? '')); };
// 相關連結：一行一個「標題 | 網址」或只有網址；本機路徑轉成 file:// 才能從頁面點開
const LINK_KIND = [[/mail\.google\.com|outlook\./, 'mail', '郵件'], [/notion\.(so|com)/, 'notion', 'Notion'], [/docs\.google\.com|drive\.google\.com/, 'gdoc', 'Google'], [/^file:/, 'file', '檔案'], [/figma\.com/, 'figma', 'Figma']];
const linkKind = url => (LINK_KIND.find(([re]) => re.test(url)) || [0, 'web', '連結']).slice(1);
const normUrl = u => u.startsWith('/') || u.startsWith('~') ? 'file://' + encodeURI(u.replace(/^~/, '')) : /^[a-z]+:/i.test(u) ? u : 'https://' + u;
function parseLinks(text) { return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const i = l.lastIndexOf(' | '); const [label, raw] = i > -1 ? [l.slice(0, i).trim(), l.slice(i + 3).trim()] : ['', l]; const url = normUrl(raw); return { label: label || decodeURI(url.split('/').filter(Boolean).pop() || url).slice(0, 40), url }; }); }
const linksText = links => (links || []).map(l => l.label ? `${l.label} | ${l.url.startsWith('file://') ? decodeURI(l.url.slice(7)) : l.url}` : l.url).join('\n');
const linkChips = links => (links || []).map(l => { const [k, name] = linkKind(l.url); return `<a class="chip ${k}" href="${esc(l.url)}" target="_blank" rel="noopener" title="${esc(l.url)}">${name}・${esc(l.label)}</a>`; }).join('');

const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICONS = {
  box: I('<path d="M3 8l9-5 9 5-9 5-9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
  flag: I('<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>'),
  doc: I('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>'),
  check: I('<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>'),
  leaf: I('<path d="M5 19c2-8 7-13 15-14-1 8-6 13-14 15"/><path d="M5 19l6-6"/>'),
  pen: I('<path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M12.5 7.5l4 4"/>'),
  folder: I('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  inbox: I('<path d="M4 13l2.5-8h11L20 13v6H4z"/><path d="M4 13h5l1.5 2h3L15 13h5"/>'),
  list: I('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
  layers: I('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>'),
  sparkle: I('<path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M17.5 14a6 6 0 0 1 4 5.5"/>'),
  trash: I('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
  edit: I('<path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M12.5 7.5l4 4"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  up: I('<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>'),
  down: I('<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>'),
};
const empty = (icon, title, hint, cls = '') => `<p class="empty ${cls}">${ICONS[icon]}<strong>${title}</strong><span>${hint}</span></p>`;
function pill(cls, text, attrs = '') { return `<button type="button" class="pill ${cls} ${attrs ? 'clickable' : ''}" ${attrs} ${attrs ? '' : 'disabled'}>${esc(text)}</button>`; }
// KPI 數字卡：圖示色塊＋標籤＋大數字，後台模板最常見的元件
const kpi = (icon, cls, label, value, sub = '') => `<div class="kpi"><span class="kpi-icon ${cls}">${ICONS[icon]}</span><div><span>${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
// 圓環進度：SVG 兩個圓，外圈依百分比畫弧
function donut(percent, size = 64) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r, tone = percent === 100 ? 'complete' : percent >= 75 ? 'near' : '';
  return `<div class="donut ${tone}" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="track"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="bar" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - percent / 100)}"/></svg><strong>${percent}%</strong></div>`;
}
const iconBtn = (icon, attrs, label) => `<button type="button" class="icon-btn" ${attrs} aria-label="${label}" title="${label}">${ICONS[icon]}</button>`;

// 總覽：KPI 一排＋每張卡片只放決策資訊：目前階段、進度、待客戶確認數
function renderOverview() {
  const projects = state.projects;
  const openAll = projects.reduce((n, p) => n + p.confirms.filter(c => c.status === 'open').length, 0);
  const tasksAll = projects.flatMap(visibleTasks), undone = tasksAll.filter(t => t.status !== 'done').length;
  const dueToday = projects.flatMap(p => visibleTasks(p).filter(t => t.status !== 'done' && t.due === today()).map(t => p.name + ' · ' + t.name));
  $('#kpis').innerHTML = kpi('folder', 'blue', '追蹤中的專案', projects.length, projects.filter(p => p.stages.every(s => s.status === 'done')).length + ' 個已全部完成')
    + (can('confirms') ? kpi('inbox', 'amber', '待客戶確認', openAll, '件等待回覆') : '')
    + kpi('list', 'purple', '未完成任務', undone, (() => { const r = tasksAll.filter(t => lightOf(t.due, t.status === 'done') === 'red').length; return r ? `${r} 件已過期或今天到期` : `共 ${tasksAll.length} 件你看得到的`; })())
    + kpi('clock', dueToday.length ? 'red' : 'green', '今天到期', dueToday.length, dueToday.length ? esc(dueToday[0]) + (dueToday.length > 1 ? ` 等 ${dueToday.length} 件` : '') : '今天沒有到期的任務');

  $('#projects-list').innerHTML = projects.map(p => {
    const tasks = visibleTasks(p), done = tasks.filter(t => t.status === 'done').length;
    const percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    const open = p.confirms.filter(c => c.status === 'open').length;
    const next = p.milestones.find(m => !m.done);
    return `<article class="project" data-open="${p.id}">
      <div class="project-head"><div><h2>${esc(p.name)}</h2><p class="client">${esc(p.client)} · 負責人 ${esc(p.owner)}</p></div>${donut(percent)}</div>
      <div class="stage-line">${activeStages(p).map(s => `<span class="pill doing">${esc(s.name)}</span>`).join('') || `<span class="pill na">${activeNames(p)}</span>`}<span>完成 ${doneCount(p)} / ${p.stages.length} 階段</span><span class="dim">${lightsBadge(lightCounts(p))}任務 ${done} / ${tasks.length}</span></div>
      <p class="goal">${esc(p.goal)}</p>
      <div class="project-foot"><span class="meta" title="最後更新">${ICONS.clock}${fmtTime(p.updatedAt)}</span><span class="meta">${ICONS.flag}${next ? esc(next.name) + ' · ' + fmtDate(next.date) : '里程碑全部完成'}</span>${can('confirms') ? `<span class="meta ${open ? 'warn' : ''}">${ICONS.inbox}待客戶確認 ${open} 件</span>` : ''}</div></article>`;
  }).join('') || empty('box', '還沒有專案', '建立第一個案子，先把目標與範圍寫清楚。', 'panel');
  $('#project-nav').innerHTML = projects.map(p => `<button class="nav ${p.id === currentId ? 'active' : ''}" data-open="${p.id}">${esc(p.name)}</button>`).join('');
}

function renderSummary(p) {
  const docs = p.stages.flatMap(s => s.docs).filter(visible), docsOk = docs.filter(d => d.status === 'confirmed').length;
  const tasks = visibleTasks(p), tasksDone = tasks.filter(t => t.status === 'done').length;
  const feats = p.stages.flatMap(s => s.features), featsDone = feats.filter(f => f.status === 'done').length;
  const open = p.confirms.filter(c => c.status === 'open').length;
  $('#p-kpis').innerHTML = kpi('layers', 'blue', '階段完成', `${doneCount(p)} / ${p.stages.length}`, '進行中：' + esc(activeNames(p)))
    + kpi('doc', 'green', '文件已確認', `${docsOk} / ${docs.length}`, '你看得到的文件')
    + kpi('list', 'purple', '任務完成', `${tasksDone} / ${tasks.length}`, (() => { const c = lightCounts(p); return c.red ? `${c.red} 項已過期或今天到期` : c.amber ? `${c.amber} 項本週內到期` : '沒有急件'; })())
    + (can('confirms') ? kpi('inbox', 'amber', '待客戶確認', open, '件等待回覆') : (() => { const m = p.milestones.find(m => !m.done); return kpi('flag', 'amber', '下個里程碑', m ? fmtDate(m.date) : '—', m ? esc(m.name) : '里程碑全部完成'); })());
  $('#p-goal').textContent = p.goal || '尚未填寫目標';
  $('#scope-block').hidden = !can('scope');
  $('#scope-in').innerHTML = p.scopeIn.map(s => `<li>${esc(s)}</li>`).join('') || '<li class="muted">未填</li>';
  $('#scope-out').innerHTML = p.scopeOut.map(s => `<li>${esc(s)}</li>`).join('') || '<li class="muted">未填</li>';
  $('#milestones').innerHTML = p.milestones.map(m => `<div class="milestone ${m.done ? 'done' : ''}"><span class="dot"></span><div><strong>${esc(m.name)}</strong><small>${light(m.date, m.done)}${esc(m.date)}${can('edit') ? ` · <button class="text-button ms-toggle" data-toggle-ms="${m.id}">${m.done ? '取消完成' : '標記完成'}</button>` : ''}</small></div></div>`).join('') || empty('flag', '還沒有里程碑', '先放上合約裡約定的幾個交付點。');
  $('#people-panel').hidden = !can('people');
  $('#people').innerHTML = p.people.map(u => `<div class="person"><span class="avatar ${u.side}">${esc(u.name.slice(0, 1))}</span><span><strong>${esc(u.name)}</strong><small>${esc(u.role)}</small></span><span class="side ${u.side}">${SIDE[u.side]}</span></div>`).join('');
}

// 階段頁：上方是步驟軸，下方是選定階段的出口條件、文件、要做的事、功能清單。狀態一點就循環切換，省掉表單。
function renderStages(p) {
  if (selectedStage == null || selectedStage >= p.stages.length) selectedStage = primaryIndex(p);
  $('#stepper').innerHTML = stepperHtml(p);
  const s = p.stages[selectedStage], docs = s.docs.filter(visible);
  renderStageDetail(p, s, docs);
}
function stepperHtml(p, r = role) {
  const v = visibleFor(r);
  return p.stages.map((s, i) => {
    const docs = s.docs.filter(v), ok = docs.filter(d => d.status === 'confirmed').length;
    const fdone = s.features.filter(f => f.status === 'done').length;
    const past = s.status === 'done', cur = s.status === 'doing';
    return `<button class="step ${past ? 'past' : ''} ${cur ? 'current' : ''} ${i === selectedStage ? 'selected' : ''}" data-stage="${i}"><span class="step-num">${past ? '✓' : i + 1}</span><strong>${esc(s.name)}</strong><span class="mini">文件 ${ok}/${docs.length}</span><span class="mini date">${past ? (s.doneOn ? '完成 ' + fmtDate(s.doneOn) : '已完成') : cur ? (s.enteredOn ? '開始 ' + fmtDate(s.enteredOn) : '進行中') : '尚未開始'}</span></button>`;
  }).join('');
}
function renderStageDetail(p, s, docs) {
  const isCurrent = s.status === 'doing', edit = can('edit');
  const allConfirmed = s.docs.filter(d => d.owner !== 'client').every(d => d.status === 'confirmed');
  const checkDone = s.checklist.filter(c => c.done).length, featDone = s.features.filter(f => f.status === 'done').length;
  // 推進條件：每個階段自己勾選要求哪些；全部達成才開放推進鈕
  const gates = [
    s.gate.docs && { ok: allConfirmed, text: '我方文件全部已確認' },
    s.gate.checklist && { ok: checkDone === s.checklist.length, text: `要做的事全部完成（${checkDone}/${s.checklist.length}）` },
  ].filter(Boolean);
  const gateOk = gates.every(g => g.ok);
  const overdue = d => d && !s.doneOn && d < today();

  const OWNER = { ours: '我方', client: '客戶', vendor: '供應商' };
  const docsHtml = docs.map(d => `<div class="doc"><span class="row-icon ${d.kind === 'notion' ? 'notion' : d.owner}">${d.kind === 'notion' ? 'N' : ICONS.doc}</span><div><strong>${esc(d.name)}</strong><small><span class="kind ${d.owner}">${OWNER[d.owner]}提供</span>${d.kind === 'notion' ? 'Notion 頁面，共同編輯' : '檔案／連結'}${d.vis.length ? ' · 可見：' + d.vis.map(v => ROLE[v].label).join('、') : ' · 僅內部'}${d.status === 'confirmed' && d.confirmedOn ? ' · 已確認 ' + esc(d.confirmedOn) : ''}</small></div>
      <div class="doc-actions">${pill(d.status, DOC_STATUS[d.status], edit ? `data-cycle-doc="${d.id}"` : '')}
      ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener" class="${d.kind === 'notion' ? 'notion' : ''}">${d.kind === 'notion' ? '在 Notion 開啟' : '開啟連結'}</a>` : (d.kind === 'notion' && edit ? '<span class="hint inline">尚未填 Notion 連結</span>' : '')}
      ${edit ? iconBtn('edit', `data-edit-doc="${d.id}"`, '文件設定') : ''}</div></div>`).join('') || empty('doc', '這個階段沒有你看得到的文件', edit ? '按「＋ 文件」加入這個階段要交付的東西。' : '需要的話，請專案負責人開放可見範圍。');

  const checkHtml = s.checklist.map(c => `<div class="check ${c.done ? 'done' : ''}"><label><input type="checkbox" data-toggle-check="${c.id}" ${c.done ? 'checked' : ''} ${edit ? '' : 'disabled'}>${light(c.due, c.done)}<span>${esc(c.text)}</span></label><input type="date" class="due-input ${!c.done && overdue(c.due) ? 'over' : ''}" value="${esc(c.due)}" data-check-due="${c.id}" title="時間節點" ${edit ? '' : 'disabled'}>${edit ? iconBtn('trash', `data-del-check="${c.id}"`, '刪除') : ''}</div>`).join('') || empty('check', '這個階段還沒列要做的事', '想到什麼先寫一行，之後再整理。');
  const featHtml = s.features.map(f => `<div class="feature ${f.status}"><span class="row-icon">${ICONS.sparkle}</span><span class="feature-text">${esc(f.text)}</span>${pill(f.status, FEATURE_STATUS[f.status], edit ? `data-cycle-feature="${f.id}"` : '')}${edit ? iconBtn('trash', `data-del-feature="${f.id}"`, '刪除') : ''}</div>`).join('') || empty('sparkle', '這個階段沒有功能清單', edit ? '開發類階段可以在這裡列出要實作的功能，一條一個。' : '這個階段沒有要實作的功能。');
  const addForm = (type, placeholder) => edit ? `<form class="inline-add" data-add-${type}="${selectedStage}"><input maxlength="80" required placeholder="${placeholder}" aria-label="${placeholder}">${type === 'check' ? '<input type="date" name="due" class="due-input" aria-label="時間節點" title="時間節點（選填）">' : ''}<button class="primary small" type="submit">加入</button></form>` : '';

  $('#stage-detail').innerHTML = `<div class="panel">
    <div class="stage-head"><div><p class="eyebrow">階段 ${selectedStage + 1} · <span class="st-${s.status}">${STAGE_STATUS[s.status]}</span></p><h2>${esc(s.name)}</h2><p class="stage-dates">${s.enteredOn ? '開始 ' + esc(s.enteredOn) : '尚未開始'}${s.doneOn ? ' → 完成 ' + esc(s.doneOn) : ''}</p></div>
      <div class="stage-tools">${edit ? `${iconBtn('up', `data-move-stage="-1"`, '往前移')}${iconBtn('down', `data-move-stage="1"`, '往後移')}${iconBtn('edit', 'data-edit-stage', '編輯名稱與出口條件')}${iconBtn('trash', 'data-del-stage', '刪除這個階段')}<button class="outline" data-add-stage>＋ 在這之後新增階段</button>` : ''}
      ${!edit ? '' : s.status === 'todo' ? '<button class="primary" data-stage-start>開始這個階段</button>' : s.status === 'doing' ? `<button class="primary" data-stage-done ${gateOk ? '' : 'disabled title="完成條件尚未全部達成"'}>完成這個階段 ✓</button>${gateOk ? '' : '<button class="text-button danger" data-stage-force>略過條件完成</button>'}` : '<button class="outline" data-stage-reopen>重新開啟</button>'}</div></div>
    <div class="exit"><strong>出口條件</strong><span>${esc(s.exit) || '尚未設定，按編輯鈕補上。'}</span>${gates.length ? `<ul class="gate">${gates.map(g => `<li class="${g.ok ? 'ok' : 'miss'}">${g.text}</li>`).join('')}</ul>` : '<em class="hint inline">沒有設定完成條件，隨時可標記完成。按編輯鈕可勾選。</em>'}</div>
    <div class="section-title"><div><h3>${ICONS.doc} 要交付的文件 <span class="count">${docs.filter(d => d.status === 'confirmed').length}/${docs.length}</span></h3><p>範本先給預設，實際要交什麼在這裡增刪。</p></div>${edit ? `<button class="text-button" data-add-doc="${selectedStage}">＋ 文件</button>` : ''}</div>
    <div class="doc-list">${docsHtml}</div>
  </div>
  ${sprintPanel(p, s, edit)}
  ${can('checklist') ? `<div class="panel internal"><div class="section-title"><div><h3>${ICONS.check} 要做的事 <span class="count">${checkDone}/${s.checklist.length}</span> <span class="badge">內部</span></h3><p>這個階段自己要跑完的步驟，勾掉就好。燈號：<span class="light red"></span>今天或已過期 <span class="light amber"></span>本週 <span class="light green"></span>還有時間 <span class="light none"></span>沒設期限</p></div></div><div class="check-list">${checkHtml}</div>${addForm('check', '新增一件要做的事…')}</div>` : ''}`;
}

function sprintPanel(p, s, edit) {
  const sprints = s.sprints || [];
  if (!sprints.length) return edit ? `<div class="sprint-off"><button class="text-button" data-add-sprint>＋ 這個階段用迭代（Sprint）進行</button><span class="hint inline">適合開發這類分批交付的階段；開了之後任務可以指定 Sprint。</span></div>` : '';
  const tasks = visibleTasks(p);
  const cards = sprints.map((sp, i) => {
    const ts = tasks.filter(t => t.sprint === sp.id), done = ts.filter(t => t.status === 'done').length;
    const percent = ts.length ? Math.round(done / ts.length * 100) : 0;
    const c = { red: ts.filter(t => lightOf(t.due, t.status === 'done') === 'red').length, amber: ts.filter(t => lightOf(t.due, t.status === 'done') === 'amber').length };
    return `<div class="sprint ${sp.status}">
      <div class="sprint-head"><strong>${esc(sp.name)}</strong>${pill(sp.status, STAGE_STATUS[sp.status], edit ? `data-cycle-sprint="${sp.id}"` : '')}</div>
      <div class="sprint-dates">${ICONS.clock}${sprintRange(sp)}${sp.status !== 'done' && sp.end && sp.end < today() ? ' <span class="warn-text">已超過結束日</span>' : ''}</div>
      <p class="sprint-goal">${sp.goal ? esc(sp.goal) : '<span class="hint inline">還沒寫目標</span>'}</p>
      <div class="sprint-foot"><div class="bar"><span style="width:${percent}%"></span></div><span>任務 ${done}/${ts.length}</span>${lightsBadge(c)}${edit ? iconBtn('edit', `data-edit-sprint="${sp.id}"`, '編輯 Sprint') : ''}</div>
      ${ts.length ? `<button class="text-button small" data-filter-sprint="${sp.id}">看這個 Sprint 的任務 →</button>` : ''}
    </div>`;
  }).join('');
  const doing = sprints.find(x => x.status === 'doing');
  return `<div class="panel"><div class="section-title"><div><h3>${ICONS.layers} 迭代 <span class="count">${sprints.filter(x => x.status === 'done').length}/${sprints.length}</span></h3><p>${doing ? `目前：${esc(doing.name)}（${sprintRange(doing)}）` : '階段裡的開發節奏；合約與驗收仍看外層階段。'}</p></div>${edit ? '<button class="text-button" data-add-sprint>＋ Sprint</button>' : ''}</div><div class="sprints">${cards}</div></div>`;
}

function renderTracking(p) {
  const all = visibleTasks(p), doneCount = all.filter(t => t.status === 'done').length;
  // 未完成在前、依期限排；沒期限的放最後
  const sprints = allSprints(p);
  if (sprintFilter && !sprints.some(sp => sp.id === sprintFilter)) sprintFilter = '';
  $('#sprint-filter').hidden = !sprints.length;
  $('#sprint-filter').innerHTML = '<option value="">全部 Sprint</option>' + sprints.map(sp => `<option value="${sp.id}">${esc(sp.name)}（${esc(sp.stageName)}）</option>`).join('') + '<option value="__none">未排 Sprint</option>';
  $('#sprint-filter').value = sprintFilter;
  const tasks = all.filter(t => showDone || t.status !== 'done').filter(t => !sprintFilter || (sprintFilter === '__none' ? !t.sprint : t.sprint === sprintFilter)).sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.due || '9999').localeCompare(b.due || '9999'));
  $('#task-count').textContent = `${all.length - doneCount} 未完成 / ${all.length}`;
  $('#show-done').checked = showDone;
  const extra = t => [t.dueNote && `期限：${esc(t.dueNote)}`, t.note && can('edit') && `備註：${esc(t.note)}`].filter(Boolean).join('<br>');
  $('#tasks').innerHTML = tasks.length ? `<table class="task-table"><thead><tr><th>任務</th><th>負責人</th><th>到期</th><th>階段</th><th>狀態</th>${can('edit') ? '<th></th>' : ''}</tr></thead><tbody>${tasks.map(t => `<tr class="${t.status === 'done' ? 'is-done' : ''}"><td>${light(t.due, t.status === 'done')}${esc(t.name)}${notionDirty(t) && can('edit') ? ` <span class="chip pending-sync" title="${t.notion?.url ? '有改動，下次同步會更新 Notion' : '下次同步時會新增到 Notion'}">待同步</span>` : ''}${t.sprint && findSprint(p, t.sprint) ? ` <span class="chip sprint-chip">${esc(findSprint(p, t.sprint).sp.name)}</span>` : ''}${(t.links || []).length ? `<div class="chips">${linkChips(t.links)}</div>` : ''}${extra(t) ? `<small class="task-extra">${extra(t)}</small>` : ''}${t.vis.length && can('edit') ? `<small class="hint">可見：${t.vis.map(v => ROLE[v].label).join('、')}</small>` : ''}</td><td>${esc(personName(p, t.assignee))}</td><td class="due">${t.dueStart ? `<small>${esc(t.dueStart)} →</small><br>` : ''}${esc(t.due || '—')}</td><td>${esc(p.stages.find(s => s.id === t.stage)?.name || '—')}</td><td>${pill(t.status, TASK_STATUS[t.status], can('edit') ? `data-cycle-task="${t.id}"` : '')}</td>${can('edit') ? `<td class="actions">${iconBtn('edit', `data-edit-task="${t.id}"`, '修改')}${iconBtn('trash', `data-del="tasks:${t.id}"`, '刪除')}</td>` : ''}</tr>`).join('')}</tbody></table>` : empty('check', all.length ? '未完成的任務都清空了' : '沒有你看得到的任務', all.length ? `已完成 ${doneCount} 件，勾「顯示已完成」可以看。` : '目前沒有分配給這個身分的工作。');

  $('#confirms-panel').hidden = !can('confirms');
  $('#confirms').innerHTML = p.confirms.map(c => `<div class="row"><div>${esc(c.text)}<small>提出於 ${esc(c.askedOn)}</small></div><div class="ops">${pill(c.status, c.status === 'open' ? '等待回覆' : '已回覆', (can('edit') || role === 'client') ? `data-cycle-confirm="${c.id}"` : '')}${can('edit') ? iconBtn('trash', `data-del="confirms:${c.id}"`, '刪除') : ''}</div></div>`).join('') || empty('check', '目前沒有等客戶回覆的事', '進度沒有卡在對方手上。');

  $('#changes-panel').hidden = !can('changes');
  $('#changes').innerHTML = p.changes.map(c => `<div class="row"><div>${esc(c.text)}<small>${esc(c.by)} · ${esc(c.date)} · 範圍外，另行報價</small></div><div class="ops">${pill(c.quote, QUOTE[c.quote], can('edit') ? `data-cycle-change="${c.id}"` : '')}${can('edit') ? iconBtn('trash', `data-del="changes:${c.id}"`, '刪除') : ''}</div></div>`).join('') || empty('leaf', '沒有變更需求', '範圍外的要求出現時再登記，記得另行報價。');

  $('#decisions-panel').hidden = !can('decisions');
  $('#decisions').innerHTML = p.decisions.map(d => `<div class="row"><div>${esc(d.text)}<small>${esc(d.by)} · ${esc(d.date)}</small></div><div class="ops">${can('edit') ? iconBtn('trash', `data-del="decisions:${d.id}"`, '刪除') : ''}</div></div>`).join('') || empty('pen', '還沒有決策紀錄', '重要的口頭同意，當天就寫一筆。');

  $('#risks-panel').hidden = !can('risks');
  $('#risks').innerHTML = p.risks.map(r => `<div class="row"><div>${esc(r.text)}<small>${esc(r.by)} · ${esc(r.date)}</small></div><div class="ops">${pill(r.level, '影響 ' + LEVEL[r.level])}${can('edit') ? iconBtn('trash', `data-del="risks:${r.id}"`, '刪除') : ''}</div></div>`).join('') || empty('leaf', '目前沒有登記的風險', '有需要才新增，不是每週必填。');
}

function renderProject() {
  const p = project(); if (!p) return;
  $('#p-client').textContent = p.client + ' · ' + (TEMPLATES[p.template]?.name || '自訂階段');
  $('#p-name').textContent = p.name;
  const fact = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  $('#p-facts').innerHTML = `<dl>${fact('客戶', esc(p.client || '—'))}${fact('期間', `${esc(p.start) || '?'} → ${esc(p.due) || '?'}`)}${fact('負責人', esc(p.owner || '—'))}${fact('進行中階段', esc(activeNames(p)))}${fact('你的身分', ROLE[role].label)}${fact('最後更新', fmtTime(p.updatedAt))}${p.notionSync && can('edit') ? fact('Notion 同步', `<span title="上次比對 ${esc(fmtTime(p.notionSync.lastChecked))}">${fmtTime(p.notionSync.lastSynced)}</span>${p.tasks.some(t => notionDirty(t)) ? ' <span class="chip pending-sync" title="工作台有改動還沒推到 Notion">待同步</span>' : ''}`) : ''}</dl>`;
  renderSummary(p); renderStages(p); renderTracking(p);
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === currentTab));
  document.querySelectorAll('.tab-panel').forEach(el => el.hidden = el.id !== 'tab-' + currentTab);
}

function render() {
  // data-need 標記按鈕需要哪些身分才顯示；集中處理，不用每個按鈕各寫一次
  document.querySelectorAll('[data-need]').forEach(b => b.hidden = !b.dataset.need.split(' ').includes(role));
  renderOverview();
  $('#overview-view').hidden = !!currentId;
  $('#project-view').hidden = !currentId;
  $('#breadcrumb').textContent = currentId ? project().name : '專案總覽';
  history.replaceState(null, '', currentId ? `#${currentId}/${currentTab}` : location.pathname + location.search);
  document.querySelector('[data-view="overview"]').classList.toggle('active', !currentId);
  if (currentId) renderProject();
  meeting = meeting && !!currentId;
  $('#meeting-view').hidden = !meeting;
  document.body.classList.toggle('in-meeting', meeting);
  if (meeting) { renderMeeting(); history.replaceState(null, '', `#${currentId}/meeting`); }
}

// 開會模式：全螢幕、大字、只顯示客戶看得到的內容（投影時不會露出內部任務、決策、風險）；底部可直接記下決策或待確認
function renderMeeting() {
  const p = project(), v = visibleFor('client'), act = activeStages(p).length ? activeStages(p) : [p.stages[primaryIndex(p)]], s = act[0];
  const docs = act.flatMap(st => st.docs.filter(v).map(d => ({ ...d, stageName: st.name }))), open = p.confirms.filter(c => c.status === 'open'), answered = p.confirms.filter(c => c.status !== 'open');
  const canNote = can('edit'), canAnswer = canNote || role === 'client';
  const list = (items, map, emptyText) => items.length ? items.map(map).join('') : `<p class="m-empty">${emptyText}</p>`;
  $('#meeting-view').innerHTML = `
    <div class="m-bar"><div><p class="eyebrow">開會模式 · 只顯示客戶看得到的內容</p><h1>${esc(p.name)}</h1><p class="m-sub">${esc(p.client)} · 進行中：${esc(activeNames(p))} · ${today()}</p>${allSprints(p).filter(sp => sp.status === 'doing').map(sp => `<p class="m-sprint">${ICONS.layers}<b>${esc(sp.name)}</b>${sprintRange(sp)}${sp.goal ? '｜' + esc(sp.goal) : ''}</p>`).join('')}</div><button class="outline" id="meeting-exit">結束開會模式 (Esc)</button></div>
    <div class="panel stepper-panel"><div class="stepper">${stepperHtml(p, 'client').replaceAll('data-stage=', 'data-noop=')}</div></div>
    <div class="m-grid">
      <div class="panel"><h2>${ICONS.doc} 進行中階段要交付的文件</h2>${list(docs, d => `<div class="m-row"><span class="row-icon ${d.kind === 'notion' ? 'notion' : d.owner}">${d.kind === 'notion' ? 'N' : ICONS.doc}</span><div><strong>${esc(d.name)}</strong><small>${act.length > 1 ? esc(d.stageName) + ' · ' : ''}${d.owner === 'ours' ? '我方提供' : d.owner === 'client' ? '客戶提供' : '供應商提供'}${d.confirmedOn ? ' · 已確認 ' + esc(d.confirmedOn) : ''}</small></div>${pill(d.status, DOC_STATUS[d.status], canNote ? `data-cycle-doc="${d.id}"` : '')}</div>`, '進行中的階段沒有要給客戶看的文件。')}</div>
      <div class="panel m-focus"><h2>${ICONS.inbox} 待客戶確認 <span class="count">${open.length}</span></h2>${list(open, c => `<div class="m-row"><div><strong>${esc(c.text)}</strong><small>提出於 ${esc(c.askedOn)}</small></div>${pill('open', '等待回覆', canAnswer ? `data-cycle-confirm="${c.id}"` : '')}</div>`, '沒有等客戶回覆的事。')}${answered.length ? `<details class="m-more"><summary>已回覆 ${answered.length} 件</summary>${answered.map(c => `<div class="m-row"><div><strong>${esc(c.text)}</strong></div>${pill('answered', '已回覆', canAnswer ? `data-cycle-confirm="${c.id}"` : '')}</div>`).join('')}</details>` : ''}</div>
      <div class="panel"><h2>${ICONS.leaf} 變更需求</h2>${list(p.changes, c => `<div class="m-row"><div><strong>${esc(c.text)}</strong><small>${esc(c.by)} · ${esc(c.date)} · 範圍外，另行報價</small></div>${pill(c.quote, QUOTE[c.quote], canNote ? `data-cycle-change="${c.id}"` : '')}</div>`, '沒有變更需求。')}</div>
      <div class="panel"><h2>${ICONS.flag} 里程碑</h2>${list(p.milestones, m => `<div class="m-row ${m.done ? 'done' : ''}"><div><strong>${light(m.date, m.done)}${esc(m.name)}</strong><small>${esc(m.date)}</small></div>${pill(m.done ? 'done' : 'todo', m.done ? '完成' : '未到')}</div>`, '還沒有里程碑。')}</div>
    </div>
    ${canNote ? `<form class="m-note" id="meeting-note"><input maxlength="200" placeholder="會議中記下：決定了什麼、或要請客戶回覆什麼…" aria-label="會議紀錄" required><button class="primary" type="submit" value="decision">記為決策</button><button class="outline" type="submit" value="confirm">記為待客戶確認</button></form>` : ''}`;
}

// ---- 表單 ----
function openProjectDialog(p) {
  editing = p?.id || null;
  $('#project-dialog-title').textContent = p ? '編輯基本資料' : '新增專案';
  $('#f-template').innerHTML = Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.name)}</option>`).join('');
  $('#f-template').disabled = !!p; // 已建立的專案不換範本，否則階段與文件狀態會對不上；要改階段直接在階段頁改
  $('#f-name').value = p?.name || ''; $('#f-client').value = p?.client || ''; $('#f-owner').value = p?.owner || '';
  $('#f-start').value = p?.start || ''; $('#f-due').value = p?.due || ''; $('#f-template').value = p?.template || 'standard';
  $('#f-goal').value = p?.goal || ''; $('#f-scope-in').value = (p?.scopeIn || []).join('\n'); $('#f-scope-out').value = (p?.scopeOut || []).join('\n');
  $('#template-hint').textContent = p && !TEMPLATES[p.template] ? '這個專案的階段是自訂的（例如依 SOW 排定），要改階段請到「階段與文件」。' : TEMPLATES[$('#f-template').value].hint + ' 建立後階段仍可自由增刪與改名。';
  $('#project-dialog').showModal();
}
$('#f-template').onchange = e => $('#template-hint').textContent = TEMPLATES[e.target.value].hint + ' 建立後階段仍可自由增刪與改名。';
$('#project-form').onsubmit = e => {
  e.preventDefault();
  const lines = id => $(id).value.split('\n').map(s => s.trim()).filter(Boolean);
  const base = { name: $('#f-name').value.trim(), client: $('#f-client').value.trim(), owner: $('#f-owner').value.trim(), start: $('#f-start').value, due: $('#f-due').value, goal: $('#f-goal').value.trim(), scopeIn: lines('#f-scope-in'), scopeOut: lines('#f-scope-out') };
  if (!base.name) return;
  if (editing) Object.assign(project(), base);
  else { const t = $('#f-template').value; const p = { id: uid(), ...base, template: t, stageIndex: 0, people: [], milestones: [], stages: buildStages(t).map((s, i) => ({ ...s, status: i === 0 ? 'doing' : 'todo' })), tasks: [], confirms: [], changes: [], decisions: [], risks: [] }; state.projects.push(p); currentId = p.id; selectedStage = null; }
  save(); $('#project-dialog').close(); render();
};

// 階段表單：編輯既有階段，或在選定階段之後新增一個
function openStageDialog(mode) {
  const s = project().stages[selectedStage];
  $('#stage-form').dataset.mode = mode;
  $('#stage-dialog-title').textContent = mode === 'edit' ? '編輯階段' : '在「' + s.name + '」之後新增階段';
  $('#st-name').value = mode === 'edit' ? s.name : ''; $('#st-exit').value = mode === 'edit' ? s.exit : '';
  $('#st-entered').value = mode === 'edit' ? s.enteredOn : ''; $('#st-done').value = mode === 'edit' ? s.doneOn : '';
  const g = mode === 'edit' ? s.gate : { docs: true, checklist: false, features: false };
  $('#st-gate-docs').checked = g.docs; $('#st-gate-check').checked = g.checklist; 
  $('#stage-dialog').showModal();
}
$('#stage-form').onsubmit = e => {
  e.preventDefault(); const p = project(); const name = $('#st-name').value.trim(), exit = $('#st-exit').value.trim(); if (!name) return;
  const enteredOn = $('#st-entered').value, doneOn = $('#st-done').value;
  const gate = { docs: $('#st-gate-docs').checked, checklist: $('#st-gate-check').checked, features: false };
  if ($('#stage-form').dataset.mode === 'edit') Object.assign(p.stages[selectedStage], { name, exit, enteredOn, doneOn, gate });
  else { p.stages.splice(selectedStage + 1, 0, { id: uid(), name, exit, docs: [], checklist: [], features: [], enteredOn, doneOn, gate, status: doneOn ? 'done' : enteredOn ? 'doing' : 'todo' }); selectedStage += 1; }
  save(); $('#stage-dialog').close(); render();
};

function openTaskDialog(t) {
  const p = project(); editing = t?.id || null;
  $('#task-dialog-title').textContent = t ? '修改任務' : '新增任務';
  $('#t-assignee').innerHTML = '<option value="">未指定</option>' + p.people.map(u => `<option value="${u.id}">${esc(u.name)}（${SIDE[u.side]}）</option>`).join('');
  $('#t-stage').innerHTML = p.stages.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  $('#t-name').value = t?.name || ''; $('#t-assignee').value = t?.assignee || ''; $('#t-due').value = t?.due || '';
  $('#t-stage').value = t?.stage || p.stages[primaryIndex(p)].id; $('#t-status').value = t?.status || 'todo';
  fillSprintSelect(t?.sprint || '');
  $('#t-vis-client').checked = !!t?.vis.includes('client'); $('#t-vis-vendor').checked = !!t?.vis.includes('vendor');
  $('#t-links').value = linksText(t?.links);
  const ns = p.notionSync;
  $('#t-notion-wrap').hidden = !ns;
  if (ns) {
    $('#t-sync').checked = t ? !!t.sync : false; $('#t-sync').disabled = !!t?.notion?.url; // 已連到 Notion 的列不能取消，避免兩邊斷線
    $('#t-due-start').value = t?.dueStart || ''; $('#t-due-note').value = t?.dueNote || ''; $('#t-basis').value = t?.basis || ''; $('#t-note').value = t?.note || '';
    $('#t-confirm-wrap').hidden = !ns.hasConfirmBy; $('#t-confirm').value = t?.confirmBy || '';
    $('#t-owner-list').innerHTML = p.people.map(u => `<option value="${esc(u.name)}">`).join('');
  }
  $('#task-dialog').showModal();
}
// 所屬 Sprint 只列出所選階段的 Sprint；階段沒開迭代就隱藏
function fillSprintSelect(value) {
  const st = project().stages.find(s => s.id === $('#t-stage').value), sps = st?.sprints || [];
  $('#t-sprint-wrap').hidden = !sps.length;
  $('#t-sprint').innerHTML = '<option value="">未排 Sprint</option>' + sps.map(sp => `<option value="${sp.id}">${esc(sp.name)}（${sprintRange(sp)}）</option>`).join('');
  $('#t-sprint').value = sps.some(sp => sp.id === value) ? value : '';
}
$('#t-stage').onchange = () => fillSprintSelect($('#t-sprint').value);
$('#task-form').onsubmit = e => {
  e.preventDefault(); const p = project();
  const vis = [$('#t-vis-client').checked && 'client', $('#t-vis-vendor').checked && 'vendor'].filter(Boolean);
  const prev = editing ? p.tasks.find(x => x.id === editing) : null;
  const t = { ...(prev || {}), id: editing || uid(), name: $('#t-name').value.trim(), assignee: $('#t-assignee').value, due: $('#t-due').value, stage: $('#t-stage').value, sprint: $('#t-sprint').value, status: $('#t-status').value, vis, links: parseLinks($('#t-links').value) };
  if (p.notionSync) Object.assign(t, { sync: prev?.notion?.url ? true : $('#t-sync').checked, dueStart: $('#t-due').value ? $('#t-due-start').value : '', dueNote: $('#t-due-note').value.trim(), basis: $('#t-basis').value.trim(), note: $('#t-note').value.trim(), confirmBy: $('#t-confirm').value.trim() });
  if (!t.name) return;
  if (editing) p.tasks = p.tasks.map(x => x.id === editing ? t : x); else p.tasks.push(t);
  save(); $('#task-dialog').close(); render();
};

// 待確認、變更、決策、風險共用一個表單，用 itemType 決定顯示哪些欄位
let itemType = null;
const ITEM = { confirm: { title: '新增待客戶確認', fields: ['date'] }, change: { title: '新增變更需求', fields: ['by', 'date', 'quote'] }, decision: { title: '新增決策紀錄', fields: ['by', 'date'] }, risk: { title: '新增風險', fields: ['by', 'date', 'level'] } };
function openItemDialog(type) {
  itemType = type; const cfg = ITEM[type];
  $('#item-dialog-title').textContent = cfg.title;
  ['by', 'date', 'level', 'quote'].forEach(f => $('#i-' + f + '-wrap').hidden = !cfg.fields.includes(f));
  $('#i-text').value = ''; $('#i-by').value = project().owner; $('#i-date').value = today(); $('#i-level').value = 'mid'; $('#i-quote').value = 'pending';
  $('#item-dialog').showModal();
}
$('#item-form').onsubmit = e => {
  e.preventDefault(); const p = project(); const text = $('#i-text').value.trim(); if (!text) return;
  const by = $('#i-by').value.trim(), date = $('#i-date').value;
  if (itemType === 'confirm') p.confirms.push({ id: uid(), text, askedOn: date, status: 'open' });
  if (itemType === 'change') p.changes.push({ id: uid(), text, by, date, quote: $('#i-quote').value });
  if (itemType === 'decision') p.decisions.push({ id: uid(), text, by, date });
  if (itemType === 'risk') p.risks.push({ id: uid(), text, by, date, level: $('#i-level').value, status: 'open' });
  save(); $('#item-dialog').close(); render();
};

function findDoc(id) { for (const s of project().stages) { const d = s.docs.find(d => d.id === id); if (d) return { s, d }; } }
function openDocDialog(doc, stageIndex) {
  editing = doc?.id || null; const s = project().stages[stageIndex];
  $('#doc-dialog-title').textContent = doc ? doc.name : '新增文件到「' + s.name + '」';
  $('#d-name').value = doc?.name || ''; $('#d-status').value = doc?.status || 'na'; $('#d-kind').value = doc?.kind || 'file'; $('#d-owner').value = doc?.owner || 'ours'; $('#d-url').value = doc?.url || '';
  $('#d-vis-client').checked = !!doc?.vis.includes('client'); $('#d-vis-vendor').checked = !!doc?.vis.includes('vendor');
  $('#d-confirmed').value = doc?.confirmedOn || '';
  $('#doc-delete').hidden = !doc;
  $('#doc-form').dataset.stage = stageIndex;
  $('#doc-dialog').showModal();
}
$('#doc-form').onsubmit = e => {
  e.preventDefault(); const s = project().stages[Number($('#doc-form').dataset.stage)];
  const vis = [$('#d-vis-client').checked && 'client', $('#d-vis-vendor').checked && 'vendor'].filter(Boolean);
  const d = { id: editing || uid(), name: $('#d-name').value.trim(), status: $('#d-status').value, kind: $('#d-kind').value, owner: $('#d-owner').value, url: $('#d-url').value.trim(), vis, confirmedOn: $('#d-confirmed').value };
  if (!d.name) return;
  if (d.status === 'confirmed' && !d.confirmedOn) d.confirmedOn = today();
  if (d.status !== 'confirmed') d.confirmedOn = '';
  if (editing) s.docs = s.docs.map(x => x.id === editing ? d : x); else s.docs.push(d);
  save(); $('#doc-dialog').close(); render();
};
$('#d-status').onchange = e => { if (e.target.value === 'confirmed' && !$('#d-confirmed').value) $('#d-confirmed').value = today(); };
$('#doc-delete').onclick = () => {
  const found = findDoc(editing); if (!found) return;
  if (!confirm('刪除文件「' + found.d.name + '」？')) return;
  found.s.docs = found.s.docs.filter(x => x.id !== editing); save(); $('#doc-dialog').close(); render();
};

// Sprint 表單：新增時名稱自動編號、日期接在上一個 Sprint 後面兩週
function openSprintDialog(id) {
  const st = project().stages[selectedStage], sps = st.sprints ||= [];
  const sp = id ? sps.find(x => x.id === id) : null; editing = sp?.id || null;
  const last = sps[sps.length - 1], start = last?.end ? addDays(last.end, 1) : (st.enteredOn && st.enteredOn > today() ? st.enteredOn : today());
  $('#sprint-dialog-title').textContent = sp ? '編輯 ' + sp.name : '新增 Sprint 到「' + st.name + '」';
  $('#sp-name').value = sp?.name || 'Sprint ' + (sps.length + 1); $('#sp-goal').value = sp?.goal || '';
  $('#sp-start').value = sp ? sp.start : start; $('#sp-end').value = sp ? sp.end : addDays(start, 13);
  $('#sp-status').value = sp?.status || (sps.some(x => x.status === 'doing') ? 'todo' : 'doing');
  $('#sprint-delete').hidden = !sp;
  $('#sprint-dialog').showModal();
}
$('#sprint-form').onsubmit = e => {
  e.preventDefault(); const st = project().stages[selectedStage];
  const v = { name: $('#sp-name').value.trim(), start: $('#sp-start').value, end: $('#sp-end').value, goal: $('#sp-goal').value.trim(), status: $('#sp-status').value };
  if (!v.name) return;
  if (editing) Object.assign(st.sprints.find(x => x.id === editing), v); else st.sprints.push({ id: uid(), ...v });
  save(); $('#sprint-dialog').close(); render();
};
$('#sprint-delete').onclick = () => {
  const p = project(), st = p.stages[selectedStage], sp = st.sprints.find(x => x.id === editing); if (!sp) return;
  const n = p.tasks.filter(t => t.sprint === sp.id).length;
  if (!confirm(`刪除「${sp.name}」？${n ? `${n} 項任務會變成「未排 Sprint」，任務本身不會刪。` : ''}`)) return;
  p.tasks.forEach(t => { if (t.sprint === sp.id) t.sprint = ''; });
  st.sprints = st.sprints.filter(x => x.id !== sp.id); save(); $('#sprint-dialog').close(); render();
};

let smallType = null;
function openSmallDialog(type) {
  smallType = type;
  $('#small-dialog-title').textContent = type === 'milestone' ? '新增里程碑' : '新增協作對象';
  $('#s-date-wrap').hidden = type !== 'milestone'; $('#s-side-wrap').hidden = type !== 'person'; $('#s-role-wrap').hidden = type !== 'person';
  $('#s-name').value = ''; $('#s-date').value = ''; $('#s-side').value = 'internal'; $('#s-role').value = '';
  $('#small-dialog').showModal();
}
$('#small-form').onsubmit = e => {
  e.preventDefault(); const p = project(); const name = $('#s-name').value.trim(); if (!name) return;
  if (smallType === 'milestone') { p.milestones.push({ id: uid(), name, date: $('#s-date').value, done: false }); p.milestones.sort((a, b) => a.date.localeCompare(b.date)); }
  else p.people.push({ id: uid(), name, side: $('#s-side').value, role: $('#s-role').value.trim() });
  save(); $('#small-dialog').close(); render();
};

document.addEventListener('keydown', e => { if (e.key === 'Escape' && meeting && !document.querySelector('dialog[open]')) { meeting = false; render(); } });
// 階段頁的行內新增（要做的事、功能）與開會模式的會議紀錄：一個輸入框＋按鈕，不開對話框
document.addEventListener('submit', e => {
  const f = e.target, d = f.dataset;
  if (f.id === 'meeting-note') {
    e.preventDefault(); const p = project(), text = f.querySelector('input').value.trim(); if (!text) return;
    if (e.submitter?.value === 'confirm') p.confirms.push({ id: uid(), text, askedOn: today(), status: 'open' });
    else p.decisions.push({ id: uid(), text, by: p.owner, date: today() });
    save(); render(); return;
  }
  if (d.addCheck == null && d.addFeature == null) return;
  e.preventDefault();
  const input = f.querySelector('input'), text = input.value.trim(); if (!text) return;
  const s = project().stages[Number(d.addCheck ?? d.addFeature)];
  if (d.addCheck != null) s.checklist.push({ id: uid(), text, done: false, due: f.querySelector('input[type=date]')?.value || '' }); else s.features.push({ id: uid(), text, status: 'todo' });
  save(); render();
});
document.addEventListener('change', e => {
  const { toggleCheck, checkDue } = e.target.dataset; if (!toggleCheck && !checkDue) return;
  const c = project().stages[selectedStage].checklist.find(c => c.id === (toggleCheck || checkDue)); if (!c) return;
  if (toggleCheck) c.done = e.target.checked; else c.due = e.target.value;
  save(); render();
});

// ---- 事件 ----
const cycle = (order, cur) => order[(order.indexOf(cur) + 1) % order.length];
document.addEventListener('click', e => {
  const b = e.target.closest('button, [data-open]'); if (!b) return; const p = project(); const d = b.dataset;
  if (d.view === 'overview') { currentId = null; render(); return; }
  if (d.open) { currentId = d.open; currentTab = 'summary'; selectedStage = null; render(); return; }
  if (d.tab) { currentTab = d.tab; render(); return; }
  if (b.classList.contains('close')) { b.closest('dialog').close(); return; }
  if (b.id === 'meeting-toggle') { meeting = true; render(); return; }
  if (b.id === 'meeting-exit') { meeting = false; render(); return; }
  if (b.id === 'add-project') openProjectDialog();
  if (b.id === 'edit-project') openProjectDialog(p);
  if (b.id === 'add-task') openTaskDialog();
  if (b.id === 'add-milestone') openSmallDialog('milestone');
  if (b.id === 'add-person') openSmallDialog('person');
  if (d.addItem) openItemDialog(d.addItem);
  if (d.stage != null) { selectedStage = Number(d.stage); render(); }
  if (d.addDoc != null) openDocDialog(null, Number(d.addDoc));
  if (d.editDoc) openDocDialog(findDoc(d.editDoc).d, selectedStage);
  if (d.editTask) openTaskDialog(p.tasks.find(t => t.id === d.editTask));
  if (d.cycleDoc) { const { d: doc } = findDoc(d.cycleDoc); doc.status = cycle(['na', 'draft', 'review', 'confirmed'], doc.status); doc.confirmedOn = doc.status === 'confirmed' ? today() : ''; save(); render(); }
  if (d.cycleTask) { const t = p.tasks.find(t => t.id === d.cycleTask); t.status = cycle(['todo', 'doing', 'done'], t.status); save(); render(); }
  if (d.cycleConfirm) { const c = p.confirms.find(c => c.id === d.cycleConfirm); c.status = c.status === 'open' ? 'answered' : 'open'; save(); render(); }
  if (d.cycleChange) { const c = p.changes.find(c => c.id === d.cycleChange); c.quote = cycle(['pending', 'quoted', 'agreed', 'declined'], c.quote); save(); render(); }
  if (d.toggleMs) { const m = p.milestones.find(m => m.id === d.toggleMs); m.done = !m.done; save(); render(); }
  if ('stageStart' in d) { const s = p.stages[selectedStage]; s.status = 'doing'; s.enteredOn ||= today(); save(); render(); }
  if ('stageDone' in d || 'stageForce' in d) {
    const s = p.stages[selectedStage];
    if (confirm(('stageForce' in d ? '完成條件尚未全部達成，仍要' : '') + '把「' + s.name + '」標記為完成？')) {
      s.status = 'done'; s.doneOn ||= today(); s.enteredOn ||= s.doneOn;
      // 如果沒有其他進行中的階段，順手開始下一個尚未開始的，維持原本「推進」的手感
      if (!activeStages(p).length) { const next = p.stages.find((x, i) => i > selectedStage && x.status === 'todo'); if (next) { next.status = 'doing'; next.enteredOn ||= today(); selectedStage = p.stages.indexOf(next); } }
      save(); render();
    }
  }
  if ('stageReopen' in d) { const s = p.stages[selectedStage]; if (confirm('重新開啟「' + s.name + '」？完成日期會清掉。')) { s.status = 'doing'; s.doneOn = ''; save(); render(); } }
  if (d.del) { const [list, id] = d.del.split(':'); const item = p[list].find(x => x.id === id); if (confirm(item?.notion?.url ? '這筆有同步到 Notion。刪除後下次同步會列出來讓你決定 Notion 那列要不要刪，確定刪除？' : '確定刪除？')) { if (item?.notion?.url) p.notionSync.removed.push(item.notion.url); p[list] = p[list].filter(x => x.id !== id); save(); render(); } }
  // 階段本身的增刪改與排序
  if ('editStage' in d) openStageDialog('edit');
  if ('addStage' in d) openStageDialog('add');
  if (d.moveStage) {
    const j = selectedStage + Number(d.moveStage); if (j < 0 || j >= p.stages.length) return;
    [p.stages[selectedStage], p.stages[j]] = [p.stages[j], p.stages[selectedStage]];
    // 目前所在階段跟著移動，不然「目前」會指到別的階段
    selectedStage = j; save(); render();
  }
  if ('delStage' in d) {
    if (p.stages.length <= 1) { alert('至少要留一個階段。'); return; }
    const s = p.stages[selectedStage];
    const linked = p.tasks.filter(t => t.stage === s.id).length;
    if (!confirm(`刪除階段「${s.name}」？${s.docs.length ? `裡面的 ${s.docs.length} 份文件會一起刪除。` : ''}${linked ? `${linked} 項任務會變成「未指定階段」。` : ''}`)) return;
    p.tasks.forEach(t => { if (t.stage === s.id) { t.stage = ''; t.sprint = ''; } });
    p.stages.splice(selectedStage, 1);
    selectedStage = Math.min(selectedStage, p.stages.length - 1); save(); render();
  }
  // 要做的事、功能清單
  if ('addSprint' in d) openSprintDialog();
  if (d.editSprint) openSprintDialog(d.editSprint);
  if (d.cycleSprint) { const { sp } = findSprint(p, d.cycleSprint); sp.status = cycle(['todo', 'doing', 'done'], sp.status); save(); render(); }
  if (d.filterSprint) { sprintFilter = d.filterSprint; currentTab = 'tracking'; render(); }
  if (d.delCheck) { const s = p.stages[selectedStage]; s.checklist = s.checklist.filter(c => c.id !== d.delCheck); save(); render(); }
  if (d.cycleFeature) { const f = p.stages.flatMap(s => s.features).find(f => f.id === d.cycleFeature); f.status = cycle(['todo', 'doing', 'done'], f.status); save(); render(); }
  if (d.delFeature) { const s = p.stages[selectedStage]; s.features = s.features.filter(f => f.id !== d.delFeature); save(); render(); }
});
$('#role').onchange = e => { role = e.target.value; render(); };
$('#show-done').onchange = e => { showDone = e.target.checked; render(); };
$('#sprint-filter').onchange = e => { sprintFilter = e.target.value; render(); };
// 從網址 hash 還原上次停留的專案與分頁
{ const [id, tab] = location.hash.slice(1).split('/'); if (state.projects.some(p => p.id === id)) { currentId = id; if (['summary', 'stages', 'tracking'].includes(tab)) currentTab = tab; if (tab === 'meeting') meeting = true; } }
render();
// 資料正本在 iCloud 資料夾的 work.json；連結後覆寫目前 state 並重畫
VaultStore.attach({ el: $('#store-status'), filename: 'work.json', get: () => state, set: data => { state = normalize(data); if (currentId && !state.projects.some(p => p.id === currentId)) currentId = null; selectedStage = null; render(); } });
