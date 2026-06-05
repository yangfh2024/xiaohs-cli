import { loadEnv } from './env.js';

function requireConfig() {
  loadEnv();
  const rawApiBase = (process.env.LARK_API_BASE || 'https://open.feishu.cn').replace(/\/$/, '');
  const apiBase = rawApiBase.endsWith('/open-apis') ? rawApiBase : `${rawApiBase}/open-apis`;

  const config = {
    appId: process.env.LARK_APP_ID,
    appSecret: process.env.LARK_APP_SECRET,
    appToken: process.env.LARK_BASE_APP_TOKEN,
    tableId: process.env.LARK_TABLE_ID,
    apiBase,
    batchSize: Math.min(Math.max(parseInt(process.env.LARK_BATCH_SIZE, 10) || 100, 1), 500)
  };

  const missing = Object.entries({
    LARK_APP_ID: config.appId,
    LARK_APP_SECRET: config.appSecret,
    LARK_BASE_APP_TOKEN: config.appToken,
    LARK_TABLE_ID: config.tableId
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`缺少飞书配置: ${missing.join(', ')}。请先填写 .env`);
  }

  return config;
}

export function validateBitableConfig() {
  const config = requireConfig();
  return {
    apiBase: config.apiBase,
    appToken: config.appToken,
    tableId: config.tableId
  };
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.LARK_REQUEST_TIMEOUT_MS || 30000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(`飞书请求失败: HTTP ${response.status} ${text}`);
    }
    if (json.code !== undefined && json.code !== 0) {
      throw new Error(`飞书接口错误: ${json.code} ${json.msg || json.message || ''}`);
    }

    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function getTenantAccessToken(config) {
  const json = await requestJson(`${config.apiBase}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret
    })
  });

  const token = json.tenant_access_token || json.data?.tenant_access_token;
  if (!token) {
    throw new Error('飞书未返回 tenant_access_token');
  }
  return token;
}


async function listFields(config, token) {
  const fields = [];
  let pageToken = '';

  do {
    const params = new URLSearchParams({ page_size: '100' });
    if (pageToken) params.set('page_token', pageToken);
    const url = `${config.apiBase}/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/fields?${params}`;
    const json = await requestJson(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    fields.push(...(json.data?.items || []));
    pageToken = json.data?.has_more ? (json.data?.page_token || '') : '';
  } while (pageToken);

  return fields;
}

const NOTE_LINK_FIELD = '笔记链接';

function extractNoteIdFromValue(value) {
  if (value === undefined || value === null) return '';

  if (Array.isArray(value)) {
    for (const item of value) {
      const noteId = extractNoteIdFromValue(item);
      if (noteId) return noteId;
    }
    return '';
  }

  if (typeof value === 'object') {
    return extractNoteIdFromValue(value.link || value.text || value.url || value.href || value.value || '');
  }

  const text = String(value).trim();
  if (!text) return '';

  const pathMatch = text.match(/(?:explore|search_result)\/([0-9a-f]{24})/i);
  if (pathMatch) return pathMatch[1].toLowerCase();

  const queryMatch = text.match(/[?&]note_id=([0-9a-f]{24})/i);
  if (queryMatch) return queryMatch[1].toLowerCase();

  const bareMatch = text.match(/\b[0-9a-f]{24}\b/i);
  return bareMatch ? bareMatch[0].toLowerCase() : '';
}

async function listExistingNoteIds(config, token) {
  const noteIds = new Set();
  let pageToken = '';

  do {
    const params = new URLSearchParams({ page_size: '500' });
    if (pageToken) params.set('page_token', pageToken);

    const json = await requestJson(
      `${config.apiBase}/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records?${params}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    for (const record of json.data?.items || []) {
      const noteId = extractNoteIdFromValue(record.fields?.[NOTE_LINK_FIELD]);
      if (noteId) noteIds.add(noteId);
    }

    pageToken = json.data?.has_more ? (json.data?.page_token || '') : '';
  } while (pageToken);

  return noteIds;
}

function filterDuplicateRows(rows, existingNoteIds) {
  const seenInBatch = new Set();
  const rowsToCreate = [];
  let skipped = 0;
  let duplicates = 0;

  for (const row of rows) {
    const noteId = extractNoteIdFromValue(row?.[NOTE_LINK_FIELD]);
    if (!noteId) {
      rowsToCreate.push(row);
      continue;
    }

    if (existingNoteIds.has(noteId)) {
      skipped += 1;
      continue;
    }

    if (seenInBatch.has(noteId)) {
      duplicates += 1;
      continue;
    }

    seenInBatch.add(noteId);
    rowsToCreate.push(row);
  }

  return { rowsToCreate, skipped, duplicates };
}

function parseCount(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const normalized = text.replace(/,/g, '');
  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)(万|w|W)?$/);
  if (!match) return null;
  const number = Number(match[1]);
  if (Number.isNaN(number)) return null;
  return match[2] ? Math.round(number * 10000) : number;
}

function coerceValue(value, field) {
  if (value === undefined || value === null || value === '') {
    return field?.type === 1 ? '' : null;
  }
  if (field?.type === 2) {
    return parseCount(value);
  }
  if (field?.type === 5) {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? null : timestamp;
  }
  if (field?.type === 15) {
    return {
      link: String(value),
      text: String(value)
    };
  }
  return String(value);
}

function coerceAttachmentValue(fileToken) {
  return [{ file_token: fileToken }];
}

function buildLarkRecords(rows, fields) {
  const fieldMap = new Map(fields.map((field) => [field.field_name, field]));
  const missing = Object.keys(rows[0] || {}).filter((name) => !fieldMap.has(name));
  if (missing.length) {
    throw new Error(`飞书表缺少字段: ${missing.join('、')}`);
  }

  return rows.map((row) => ({
    fields: Object.fromEntries(
      Object.entries(row).map(([name, value]) => {
        const field = fieldMap.get(name);
        return [field.field_name || name, coerceValue(value, field)];
      })
    )
  }));
}

export async function ensureFieldExists(config, token, fieldName, fieldType = 1) {
  const fields = await listFields(config, token);
  const existing = fields.find((f) => f.field_name === fieldName);
  if (existing) return existing;

  const url = `${config.apiBase}/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/fields`;
  const json = await requestJson(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      field_name: fieldName,
      type: fieldType
    })
  });
  return json.data?.field;
}

export async function writeRowsToBitable(rows) {
  if (!rows.length) {
    return { created: 0, batches: 0, skipped: 0, duplicates: 0 };
  }

  const config = requireConfig();
  const token = await getTenantAccessToken(config);
  const fields = await listFields(config, token);
  const existingNoteIds = await listExistingNoteIds(config, token);
  const { rowsToCreate, skipped, duplicates } = filterDuplicateRows(rows, existingNoteIds);

  // Identify attachment fields (type 17)
  const attachmentFields = fields.filter((f) => f.type === 17);
  const attachmentFieldNames = new Set(attachmentFields.map((f) => f.field_name));
  const attachmentFieldNamesList = [...attachmentFieldNames];

  let created = 0;
  let batches = 0;

  for (let index = 0; index < rowsToCreate.length; index += config.batchSize) {
    const batch = rowsToCreate.slice(index, index + config.batchSize);

    // Separate rows with and without attachments
    const withAttachment = [];
    const withoutAttachment = [];

    for (const row of batch) {
      const hasAttachment = attachmentFieldNamesList.some((name) => {
        const val = row[name];
        return val && typeof val === 'string' && val.startsWith('http');
      });
      if (hasAttachment) {
        withAttachment.push(row);
      } else {
        withoutAttachment.push(row);
      }
    }

    // Batch create rows without attachments
    if (withoutAttachment.length > 0) {
      const records = buildLarkRecords(withoutAttachment, fields);
      await requestJson(`${config.apiBase}/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/batch_create`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ records })
      });
      created += withoutAttachment.length;
    }

    // Rows with attachments: create one by one to get record_id, then upload
    for (const row of withAttachment) {
      // Strip attachment fields before creating record
      const rowWithoutAttachments = { ...row };
      for (const fname of attachmentFieldNamesList) {
        delete rowWithoutAttachments[fname];
      }

      const records = buildLarkRecords([rowWithoutAttachments], fields);
      const createResp = await requestJson(
        `${config.apiBase}/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(records[0]) }
      );

      const recordId = createResp?.data?.record?.record_id;
      if (!recordId) {
        console.warn(`记录创建失败，跳过封面上传`);
        continue;
      }

      // Upload each attachment field
      for (const fname of attachmentFieldNamesList) {
        const imageUrl = row[fname];
        if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) continue;

        try {
          await uploadAttachmentToRecord(config, recordId, fname, imageUrl);
        } catch (err) {
          console.warn(`封面上传失败 (${fname}): ${err.message}`);
        }
      }

      created += 1;
    }

    batches += 1;
  }

  return { created, batches, skipped, duplicates };
}

async function uploadAttachmentToRecord(config, recordId, fieldName, imageUrl) {
  const { exec } = await import('node:child_process');
  const path = await import('node:path');
  const fs = await import('node:fs');

  // Download image to local temp file (relative path for lark-cli)
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`下载失败: HTTP ${response.status}`);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
  const tmpFile = `./.tmp_cover_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
  fs.writeFileSync(tmpFile, buffer);

  return new Promise((resolve, reject) => {
    const cmd = [
      'lark-cli', 'base', '+record-upload-attachment',
      '--base-token', config.appToken,
      '--table-id', config.tableId,
      '--record-id', recordId,
      '--field-id', fieldName,
      '--file', tmpFile
    ];

    exec(cmd.join(' '), { timeout: 60000 }, (err, stdout, stderr) => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout);
      }
    });
  });
}
