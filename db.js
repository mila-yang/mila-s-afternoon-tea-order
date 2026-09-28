/**
 * 下午茶訂餐系統 - 資料層 (db.js)
 *
 * 兩種模式：
 * 1. 本機展示模式（USE_FIREBASE = false）：資料存在瀏覽器 localStorage，
 *    同一台裝置的多個分頁可即時同步，適合本機試玩。
 * 2. Firebase 即時多人模式（USE_FIREBASE = true）：
 *    只要填好下方的 FIREBASE_CONFIG，同事手機下單、開團者電腦即時看到。
 *
 * Firebase 設定步驟：
 * 1. 到 https://console.firebase.google.com 建立專案
 * 2. 左側「建構」→「Realtime Database」→「建立資料庫」→ 選測試模式
 * 3. 專案設定 →「你的應用程式」→ 新增網頁應用程式，複製 firebaseConfig
 * 4. 把 firebaseConfig 貼到下方，並把 USE_FIREBASE 改為 true
 * 5. 重新部署即可，不需要改其他程式碼
 */

const USE_FIREBASE = true; // 已啟用 Firebase 即時多人模式（Mila 的下午茶專案）

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDtWsazBEbOOEh3QJxeQ0c45CJ7EC9rzLQ",
  authDomain: "mila-s-afternoon-tea.firebaseapp.com",
  databaseURL: "https://mila-s-afternoon-tea-default-rtdb.firebaseio.com",
  projectId: "mila-s-afternoon-tea",
  storageBucket: "mila-s-afternoon-tea.firebasestorage.app",
  messagingSenderId: "266478716405",
  appId: "1:266478716405:web:f6a57e257a1587a10a4cbc"
};

// ==================== 以下不需要修改 ====================

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ---------- 本機模式 (localStorage) ----------
const LS_KEYS = { session: 'tea_session', menu: 'tea_menu', orders: 'tea_orders' };
function lsGet(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; }
  catch { return fallback; }
}
function lsSet(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
  window.dispatchEvent(new CustomEvent('tea-data-change', { detail: { key } }));
}
const lsListeners = { session: [], menu: [], orders: [] };
window.addEventListener('tea-data-change', (e) => {
  const map = { [LS_KEYS.session]: 'session', [LS_KEYS.menu]: 'menu', [LS_KEYS.orders]: 'orders' };
  const type = map[e.detail.key];
  if (type) lsListeners[type].forEach(fn => fn(lsGet(e.detail.key, (type === 'menu' || type === 'orders') ? [] : null)));
});
window.addEventListener('storage', (e) => {
  const map = { [LS_KEYS.session]: 'session', [LS_KEYS.menu]: 'menu', [LS_KEYS.orders]: 'orders' };
  const type = map[e.key];
  if (type) lsListeners[type].forEach(fn => fn(lsGet(e.key, (type === 'menu' || type === 'orders') ? [] : null)));
});

const LocalDB = {
  async getSession() { return lsGet(LS_KEYS.session, { title: '下午茶訂餐', deadline: null }); },
  async saveSession(s) { lsSet(LS_KEYS.session, s); },
  onSessionChange(fn) { lsListeners.session.push(fn); },
  async getMenu() { return lsGet(LS_KEYS.menu, []); },
  async addMenuItem(item) { const m = await this.getMenu(); m.push({ id: uid(), ...item }); lsSet(LS_KEYS.menu, m); },
  async updateMenuItem(id, updated) { lsSet(LS_KEYS.menu, (await this.getMenu()).map(m => m.id === id ? updated : m)); },
  async deleteMenuItem(id) { lsSet(LS_KEYS.menu, (await this.getMenu()).filter(m => m.id !== id)); },
  onMenuChange(fn) { lsListeners.menu.push(fn); },
  async getOrders() { return lsGet(LS_KEYS.orders, []); },
  async addOrder(order) { const o = await this.getOrders(); o.push({ id: uid(), ...order }); lsSet(LS_KEYS.orders, o); },
  async clearOrders() { lsSet(LS_KEYS.orders, []); },
  onOrdersChange(fn) { lsListeners.orders.push(fn); },
};

// ---------- Firebase 模式 ----------
let firebaseDB = null;
function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.error('找不到 Firebase SDK，請確認 index.html / admin.html 有引入 firebase-app-compat.js 和 firebase-database-compat.js');
    return false;
  }
  if (!FIREBASE_CONFIG.databaseURL && !FIREBASE_CONFIG.projectId) {
    console.error('請先填寫 FIREBASE_CONFIG');
    return false;
  }
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  // 沒填 databaseURL 時自動組合
  const url = FIREBASE_CONFIG.databaseURL || `https://${FIREBASE_CONFIG.projectId}-default-rtdb.firebaseio.com`;
  firebaseDB = firebase.database();
  return true;
}
const snapVal = (snap, fallback) => snap.val() ?? fallback;
const snapList = (snap) => Object.values(snap.val() || {});

const FirebaseDB = {
  async getSession() { return snapVal(await firebaseDB.ref('session').once('value'), { title: '下午茶訂餐', deadline: null }); },
  async saveSession(s) { await firebaseDB.ref('session').set(s); },
  onSessionChange(fn) { firebaseDB.ref('session').on('value', snap => fn(snapVal(snap, { title: '下午茶訂餐', deadline: null }))); },
  async getMenu() { return snapList(await firebaseDB.ref('menu').once('value')); },
  async addMenuItem(item) { const id = uid(); await firebaseDB.ref('menu/' + id).set({ id, ...item }); },
  async updateMenuItem(id, updated) { await firebaseDB.ref('menu/' + id).set(updated); },
  async deleteMenuItem(id) { await firebaseDB.ref('menu/' + id).remove(); },
  onMenuChange(fn) { firebaseDB.ref('menu').on('value', snap => fn(snapList(snap))); },
  async getOrders() { return snapList(await firebaseDB.ref('orders').once('value')); },
  async addOrder(order) { const id = uid(); await firebaseDB.ref('orders/' + id).set({ id, ...order }); },
  async clearOrders() { await firebaseDB.ref('orders').remove(); },
  onOrdersChange(fn) { firebaseDB.ref('orders').on('value', snap => fn(snapList(snap))); },
};

// ---------- 自動選擇模式 ----------
let DB;
if (USE_FIREBASE) {
  if (initFirebase()) {
    DB = FirebaseDB;
    console.log('已啟用 Firebase 即時多人模式');
  } else {
    console.warn('Firebase 初始化失敗，退回本機模式');
    DB = LocalDB;
  }
} else {
  DB = LocalDB;
}
window.DB = DB;
