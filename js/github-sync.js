import { COLUMNS, DEFAULT_KB_ITEMS } from './data.js';

export const KB_STORAGE_KEY = 'muhtasim_kanban_v1';
export const KB_PAT_KEY = 'muhtasim_gh_pat';
export const GH_OWNER = 'nasif43';
export const GH_REPO = 'whats-muhtasim-upto';
export const GH_PATH = 'kanban.json';
export const GH_COMMIT_MESSAGE = 'chore: update kanban board from web';

const VALID_STAGES = new Set(COLUMNS.map(col => col.id));
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const BASE64_CHUNK_SIZE = 0x8000;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidKanbanItem(item) {
  return (
    isPlainObject(item) &&
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.stage === 'string' &&
    VALID_STAGES.has(item.stage)
  );
}

function cloneItems(items) {
  return items.map(item => ({ ...item }));
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function encodeUtf8Base64(str) {
  const input = typeof str === 'string' ? str : String(str ?? '');
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function decodeUtf8Base64(b64) {
  const normalized = String(b64 ?? '').replace(/\s+/g, '');
  if (!normalized) return '';
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function getPat(storage = getDefaultStorage()) {
  try {
    const value = storage?.getItem(KB_PAT_KEY);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

export function savePat(pat, storage = getDefaultStorage()) {
  if (typeof pat !== 'string') return false;
  const trimmed = pat.trim();
  if (!trimmed || !storage) return false;
  try {
    storage.setItem(KB_PAT_KEY, trimmed);
    return true;
  } catch {
    return false;
  }
}

export function clearPat(storage = getDefaultStorage()) {
  try {
    storage?.removeItem(KB_PAT_KEY);
  } catch {
    // Ignore storage errors when clearing token
  }
}

export function loadLocalDraft(storage = getDefaultStorage()) {
  let raw;
  try {
    raw = storage?.getItem(KB_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'string') return null;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;

  const sanitized = {};
  let count = 0;
  for (const [key, stage] of Object.entries(parsed)) {
    if (UNSAFE_KEYS.has(key)) continue;
    if (typeof stage === 'string' && VALID_STAGES.has(stage)) {
      sanitized[key] = stage;
      count += 1;
    }
  }
  return count > 0 ? sanitized : null;
}

export function clearLocalDraft(storage = getDefaultStorage()) {
  try {
    storage?.removeItem(KB_STORAGE_KEY);
  } catch {
    // Ignore storage errors when clearing draft
  }
}

export function saveLocalDraft(items, defaults, storage = getDefaultStorage()) {
  const list = Array.isArray(items) ? items : [];
  const draft = {};
  for (const item of list) {
    if (!isValidKanbanItem(item) || UNSAFE_KEYS.has(item.id)) continue;
    draft[item.id] = item.stage;
  }

  if (Array.isArray(defaults)) {
    const defaultStages = new Map();
    for (const def of defaults) {
      if (isValidKanbanItem(def) && !UNSAFE_KEYS.has(def.id)) {
        defaultStages.set(def.id, def.stage);
      }
    }

    const keys = Object.keys(draft);
    const matchesDefaults =
      keys.length === defaultStages.size &&
      keys.every(id => defaultStages.get(id) === draft[id]);

    if (matchesDefaults) {
      clearLocalDraft(storage);
      return { hasChanges: false, draft: {} };
    }
  }

  if (Object.keys(draft).length === 0) {
    clearLocalDraft(storage);
    return { hasChanges: false, draft: {} };
  }

  try {
    storage?.setItem(KB_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage quota/availability failures
  }
  return { hasChanges: true, draft };
}

export function mergeKanbanItems(baseItems, draftMap) {
  const items = Array.isArray(baseItems) ? baseItems : [];
  const hasDraft = isPlainObject(draftMap);
  return items.map(item => {
    if (
      hasDraft &&
      typeof item?.id === 'string' &&
      !UNSAFE_KEYS.has(item.id) &&
      Object.hasOwn(draftMap, item.id) &&
      typeof draftMap[item.id] === 'string' &&
      VALID_STAGES.has(draftMap[item.id])
    ) {
      return { ...item, stage: draftMap[item.id] };
    }
    return { ...item };
  });
}

export async function loadKanbanBoard({
  fetchImpl = globalThis.fetch,
  storage = getDefaultStorage(),
  fallbackItems = DEFAULT_KB_ITEMS,
} = {}) {
  let baseItems = cloneItems(Array.isArray(fallbackItems) ? fallbackItems : DEFAULT_KB_ITEMS);
  let source = 'fallback';

  if (typeof fetchImpl === 'function') {
    try {
      const res = await fetchImpl(`./${GH_PATH}?t=${Date.now()}`);
      if (res?.ok) {
        const remoteItems = await res.json();
        if (
          Array.isArray(remoteItems) &&
          remoteItems.length > 0 &&
          remoteItems.every(isValidKanbanItem)
        ) {
          baseItems = cloneItems(remoteItems);
          source = 'remote';
        }
      }
    } catch {
      // Offline or malformed JSON falls back to fallbackItems
    }
  }

  const draft = loadLocalDraft(storage);
  if (draft) {
    return {
      items: mergeKanbanItems(baseItems, draft),
      hasUnsavedChanges: true,
      source,
    };
  }

  return {
    items: baseItems,
    hasUnsavedChanges: false,
    source,
  };
}

export async function fetchRemoteSha({ pat, fetchImpl = globalThis.fetch } = {}) {
  const trimmedPat = typeof pat === 'string' ? pat.trim() : '';
  if (!trimmedPat || typeof fetchImpl !== 'function') return null;

  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}?t=${Date.now()}`;
  try {
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${trimmedPat}`,
        Accept: 'application/vnd.github+json',
      },
    });
    if (!res?.ok) return null;
    const data = await res.json();
    return typeof data?.sha === 'string' && data.sha ? data.sha : null;
  } catch {
    return null;
  }
}

function createGitHubError(status, errBody, context) {
  const messages = {
    401: 'GitHub authentication failed (401). Your PAT may be invalid or expired.',
    403: 'GitHub access forbidden (403). Ensure your PAT has Contents read/write access or check rate limits.',
    404: `GitHub file not found (404). Check repository access for ${GH_OWNER}/${GH_REPO}.`,
    409: `GitHub SHA conflict (409). ${GH_PATH} changed remotely; reload and try again.`,
    422: 'GitHub rejected the update (422). Invalid SHA or commit payload.',
    429: 'GitHub rate limit exceeded (429). Please wait and try again.',
  };
  const message =
    messages[status] ||
    (typeof errBody?.message === 'string' && errBody.message) ||
    `GitHub ${context} failed (${status}).`;
  const error = new Error(message);
  error.status = status;
  if (typeof errBody?.message === 'string' && errBody.message) {
    error.githubMessage = errBody.message;
  }
  return error;
}

export async function saveKanbanToGitHub({
  items,
  pat,
  lastKnownSha = null,
  confirmOverwrite,
  fetchImpl = globalThis.fetch,
  storage = getDefaultStorage(),
} = {}) {
  const trimmedPat = typeof pat === 'string' ? pat.trim() : '';
  if (!trimmedPat) {
    throw new Error('GitHub PAT is required to save.');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Kanban items array is required to save.');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch implementation is unavailable.');
  }

  const contentsUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`;
  const getRes = await fetchImpl(`${contentsUrl}?t=${Date.now()}`, {
    headers: {
      Authorization: `Bearer ${trimmedPat}`,
      Accept: 'application/vnd.github+json',
    },
  });

  if (!getRes?.ok) {
    const errBody = await getRes?.json?.().catch(() => ({})) ?? {};
    throw createGitHubError(getRes?.status ?? 0, errBody, 'fetch');
  }

  const fileData = await getRes.json();
  const remoteSha = typeof fileData?.sha === 'string' ? fileData.sha : '';
  if (!remoteSha) {
    throw new Error('GitHub metadata response did not include a file SHA.');
  }

  if (lastKnownSha && remoteSha !== lastKnownSha) {
    const proceed =
      typeof confirmOverwrite === 'function'
        ? Boolean(await confirmOverwrite({ remoteSha, lastKnownSha }))
        : false;
    if (!proceed) {
      return {
        sha: remoteSha,
        message: 'Save cancelled.',
        cancelled: true,
      };
    }
  }

  const contentStr = `${JSON.stringify(items, null, 2)}\n`;
  const contentB64 = encodeUtf8Base64(contentStr);

  const putRes = await fetchImpl(contentsUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${trimmedPat}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: GH_COMMIT_MESSAGE,
      content: contentB64,
      sha: remoteSha,
    }),
  });

  if (!putRes?.ok) {
    const errBody = await putRes?.json?.().catch(() => ({})) ?? {};
    throw createGitHubError(putRes?.status ?? 0, errBody, 'save');
  }

  const putData = await putRes.json().catch(() => ({}));
  clearLocalDraft(storage);

  return {
    sha: putData?.content?.sha || null,
    message: 'Saved to GitHub! Live in ~30s.',
    cancelled: false,
  };
}
