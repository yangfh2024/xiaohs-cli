/**
 * 封装 kimi-webbridge HTTP 调用
 * 核心原则：任何操作都不应无限阻塞，超时后能恢复
 */
import http from 'http';

const BASE = 'http://127.0.0.1:10086';
export const SESSION = 'xiaohs-cli';

let _currentTabId = null;

/**
 * 基础 HTTP 请求 - 每次新建连接，避免复用导致的问题
 */
function request(action, args = {}, session = SESSION) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ action, args, session });
    const options = {
      hostname: '127.0.0.1',
      port: 10086,
      path: '/command',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Connection': 'close'  // 关键：禁用 keepAlive，每次新建连接
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data.toString());
          if (json.data?.tabId) _currentTabId = json.data.tabId;
          if (json.error?.message?.includes('session') && json.error.message.includes('closed')) {
            _currentTabId = null;
          }
          resolve(json);
        } catch (e) {
          reject(new Error(`响应解析失败: ${e.message}`));
        }
      });
    });
    req.on('error', e => reject(new Error(`kimi-webbridge 请求失败: ${e.message}`)));
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('请求超时 (15s)')); });
    req.write(body);
    req.end();
  });
}

async function command(action, args = {}, session = SESSION) {
  return request(action, args, session);
}

/**
 * 确保当前 tab 存活，不存活则重建
 */
async function ensureTab() {
  try {
    const tabs = await listTabs();
    const current = tabs?.data?.tabs?.find(t => t.tabId === _currentTabId);
    if (!current) {
      await command('navigate', { url: 'about:blank', newTab: true });
      return true;
    }
  } catch (e) {
    // 出错就重建
    try {
      await command('navigate', { url: 'about:blank', newTab: true });
      return true;
    } catch (e2) {
      return false;
    }
  }
  return false;
}

/**
 * 安全导航：navigate + 等待页面稳定 + 返回 snapshot
 */
export async function safeNavigate(url, opts = {}) {
  const groupTitle = opts.group_title || 'xiaohs-cli';
  // 不用 newTab:true，避免 tab 在命令间隔期间变成 stale
  const navResult = await command('navigate', { url, newTab: false, group_title: groupTitle, ...opts });
  if (!navResult.ok) {
    throw new Error(`导航失败: ${navResult.error?.message}`);
  }

  await new Promise(r => setTimeout(r, 3000));
  const snap = await snapshot();
  return { navResult, snapshot: snap };
}

/**
 * 等待页面包含目标文本（短超时，不抛异常）
 */
export async function waitForText(texts, timeout = 5000) {
  try {
    return await command('wait_for', {
      text: Array.isArray(texts) ? texts : [texts],
      timeout
    });
  } catch (e) {
    return null;
  }
}

/**
 * 轮询等待页面包含目标文本
 */
export async function pollForText(texts, interval = 1000, totalTimeout = 30000) {
  const targets = Array.isArray(texts) ? texts : [texts];
  const start = Date.now();

  while (Date.now() - start < totalTimeout) {
    try {
      const snap = await snapshot();
      const tree = snap?.data?.tree || '';
      const found = targets.some(t => tree.includes(t));
      if (found) return { found: true, snapshot: snap };
    } catch (e) {
      await ensureTab();
    }
    await new Promise(r => setTimeout(r, interval));
  }

  const lastSnap = await snapshot().catch(() => null);
  return { found: false, snapshot: lastSnap };
}

// ========== 基础 API ==========

export async function navigate(url, opts = {}) {
  return command('navigate', { url, ...opts });
}

export async function snapshot() {
  return command('snapshot', {});
}

export async function click(selector) {
  return command('click', { selector });
}

export async function fill(selector, value) {
  return command('fill', { selector, value });
}

export async function evaluate(code) {
  return command('evaluate', { code });
}

/**
 * 执行 JS 并返回结果，自动处理错误和序列化
 * @param {string} fn - 函数体，返回可序列化数据
 */
export async function evalJS(fn) {
  const result = await command('evaluate', { code: `(${fn})()` });
  if (!result.ok) throw new Error(result.error?.message || 'evaluate failed');
  const inner = result.data?.value;
  if (!inner) throw new Error('no value in evaluate result');
  if (typeof inner === 'string') return JSON.parse(inner);
  return inner;
}

export async function screenshot(opts = {}) {
  return command('screenshot', opts);
}

export async function listTabs() {
  return command('list_tabs', {});
}

export async function closeTab() {
  return command('close_tab', {});
}

export async function closeSession() {
  return command('close_session', {});
}

export async function waitFor(texts, timeout = 5000) {
  return command('wait_for', { text: texts, timeout });
}

export async function getNetworkRequest(reqId) {
  return command('network', { cmd: 'detail', requestId: reqId });
}

export async function listNetworkRequests(filter) {
  return command('network', { cmd: 'list', filter });
}
