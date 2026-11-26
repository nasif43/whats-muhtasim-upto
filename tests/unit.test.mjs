import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CATEGORIES,
  COLUMNS,
  DEFAULT_KB_ITEMS,
  SCHEDULE_DATA,
  WORK_TARGET_MAP,
  resolveWorkTarget,
} from '../js/data.js';
import {
  GH_COMMIT_MESSAGE,
  GH_OWNER,
  GH_PATH,
  GH_REPO,
  KB_PAT_KEY,
  KB_STORAGE_KEY,
  clearLocalDraft,
  clearPat,
  decodeUtf8Base64,
  encodeUtf8Base64,
  fetchRemoteSha,
  getPat,
  loadKanbanBoard,
  loadLocalDraft,
  mergeKanbanItems,
  saveKanbanToGitHub,
  saveLocalDraft,
  savePat,
} from '../js/github-sync.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const kanbanRaw = readFileSync(resolve(repoRoot, 'kanban.json'), 'utf8');
const kanbanJson = JSON.parse(kanbanRaw);
const indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    snapshot() {
      return Object.fromEntries(store.entries());
    },
  };
}

function createThrowingStorage() {
  return {
    getItem() {
      throw new Error('storage blocked');
    },
    setItem() {
      throw new Error('storage quota exceeded');
    },
    removeItem() {
      throw new Error('storage blocked');
    },
  };
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      if (body instanceof Error) throw body;
      return body;
    },
  };
}

describe('1. js/data.js & kanban.json parity', () => {
  it('DEFAULT_KB_ITEMS matches kanban.json deeply and preserves 8-key schema', () => {
    assert.equal(DEFAULT_KB_ITEMS.length, 19);
    assert.equal(kanbanJson.length, 19);
    assert.deepEqual(DEFAULT_KB_ITEMS, kanbanJson);

    const expectedKeys = ['id', 'title', 'cat', 'tag', 'tagClass', 'stage', 'date', 'note'];
    for (const item of DEFAULT_KB_ITEMS) {
      assert.deepEqual(Object.keys(item), expectedKeys);
    }
  });

  it('includes the 4 synced stage values from commit 894144c', () => {
    const byId = new Map(DEFAULT_KB_ITEMS.map(item => [item.id, item]));
    assert.equal(byId.get('kb-metapos')?.stage, 'testing');
    assert.equal(byId.get('kb-omni')?.stage, 'testing');
    assert.equal(byId.get('kb-helpdesk')?.stage, 'testing');
    assert.equal(byId.get('kb-upgrader')?.stage, 'active');
  });

  it('COLUMNS and CATEGORIES cover every stage and category present in kanban.json', () => {
    const columnIds = new Set(COLUMNS.map(c => c.id));
    const categoryIds = new Set(CATEGORIES.map(c => c.id));

    assert.deepEqual([...columnIds], ['scoping', 'active', 'testing', 'shipped']);
    assert.ok(categoryIds.has('all'));

    for (const item of kanbanJson) {
      assert.ok(columnIds.has(item.stage), `Unknown stage ${item.stage} on ${item.id}`);
      assert.ok(categoryIds.has(item.cat), `Unknown category ${item.cat} on ${item.id}`);
    }
  });
});

describe('2. WORK_TARGET_MAP & resolveWorkTarget', () => {
  it('maps all 19/19 kanban items with valid cardId and boolean isOlder', () => {
    assert.equal(Object.keys(WORK_TARGET_MAP).length, 19);
    for (const item of kanbanJson) {
      const target = resolveWorkTarget(item.id);
      assert.ok(target, `Missing target mapping for ${item.id}`);
      assert.equal(typeof target.cardId, 'string');
      assert.ok(target.cardId.length > 0);
      assert.equal(typeof target.isOlder, 'boolean');
    }
  });

  it('maps non-1:1 IDs and #card-omni sub-targets accurately', () => {
    assert.deepEqual(resolveWorkTarget('kb-uniwatch'), {
      cardId: 'card-uni',
      isOlder: true,
    });
    assert.deepEqual(resolveWorkTarget('kb-shorturl'), {
      cardId: 'card-url',
      isOlder: true,
    });
    assert.deepEqual(resolveWorkTarget('kb-tiktok'), {
      cardId: 'card-omni',
      isOlder: false,
      subTargetId: 'omni-channel-tiktok',
      openDevlog: true,
    });
    assert.deepEqual(resolveWorkTarget('kb-viber'), {
      cardId: 'card-omni',
      isOlder: false,
      subTargetId: 'omni-channel-viber',
      openDevlog: true,
    });
    assert.deepEqual(resolveWorkTarget('kb-omni'), {
      cardId: 'card-omni',
      isOlder: false,
    });
  });

  it('all 17 referenced cardIds exist in index.html with matching #older-projects placement', () => {
    const olderMarker = '<div id="older-projects"';
    const olderStart = indexHtml.indexOf(olderMarker);
    assert.ok(olderStart > 0, '#older-projects container missing from index.html');

    const seenCards = new Set();
    for (const [kbId, target] of Object.entries(WORK_TARGET_MAP)) {
      seenCards.add(target.cardId);
      const idIdx = indexHtml.indexOf(`id="${target.cardId}"`);
      assert.ok(idIdx > 0, `Card #${target.cardId} for ${kbId} not found in index.html`);
      const actuallyOlder = idIdx > olderStart;
      assert.equal(
        target.isOlder,
        actuallyOlder,
        `isOlder mismatch for ${kbId} -> ${target.cardId}`
      );
    }
    assert.equal(seenCards.size, 17);
  });

  it('handles unknown/unsafe keys cleanly and returns non-mutating shallow copies', () => {
    assert.equal(resolveWorkTarget('kb-nonexistent'), null);
    assert.equal(resolveWorkTarget(''), null);
    assert.equal(resolveWorkTarget(null), null);
    assert.equal(resolveWorkTarget(undefined), null);
    assert.equal(resolveWorkTarget('toString'), null);
    assert.equal(resolveWorkTarget('constructor'), null);

    const copy = resolveWorkTarget('kb-metapos');
    copy.cardId = 'tampered';
    assert.equal(resolveWorkTarget('kb-metapos').cardId, 'card-metapos');
  });
});

describe('3. SCHEDULE_DATA', () => {
  it('defines IUB Autumn 2026 Sun-Wed classes, timezone, 6 timeSlots, and 4 legend entries', () => {
    assert.equal(SCHEDULE_DATA.timezone, 'Asia/Dhaka');
    assert.equal(SCHEDULE_DATA.dayNames.length, 7);
    assert.deepEqual(Object.keys(SCHEDULE_DATA.days).map(Number), [0, 1, 2, 3]);
    assert.equal(SCHEDULE_DATA.timeSlots.length, 6);
    assert.equal(SCHEDULE_DATA.legend.length, 4);

    const labels = new Set(
      Object.values(SCHEDULE_DATA.days)
        .flat()
        .map(session => session.label)
    );
    assert.deepEqual(
      [...labels].sort(),
      ['CMN419 Sec 1', 'CSC425 Sec 4', 'CSC430 Sec 3', 'CSC430L Sec 3', 'CSC445 Sec 4']
    );
  });
});

describe('4. UTF-8 Base64 helpers', () => {
  it('round-trips ASCII, kanban.json Unicode characters, and emojis accurately', () => {
    const ascii = '{"hello":"world"}\n';
    assert.equal(decodeUtf8Base64(encodeUtf8Base64(ascii)), ascii);

    const b64Kanban = encodeUtf8Base64(kanbanRaw);
    assert.equal(decodeUtf8Base64(b64Kanban), kanbanRaw);

    const emojiText = 'MetaPOS 🚀 — Bengali & UTF-8: ã · → –';
    assert.equal(decodeUtf8Base64(encodeUtf8Base64(emojiText)), emojiText);
  });

  it('decodes newline-wrapped GitHub Contents API base64 strings', () => {
    const b64 = encodeUtf8Base64(kanbanRaw);
    const wrapped = b64.match(/.{1,60}/g).join('\n') + '\n';
    assert.equal(decodeUtf8Base64(wrapped), kanbanRaw);
    assert.equal(decodeUtf8Base64(''), '');
  });
});

describe('5. Storage, PAT, local draft & merge helpers', () => {
  it('preserves exact storage & GitHub constants', () => {
    assert.equal(KB_STORAGE_KEY, 'muhtasim_kanban_v1');
    assert.equal(KB_PAT_KEY, 'muhtasim_gh_pat');
    assert.equal(GH_OWNER, 'nasif43');
    assert.equal(GH_REPO, 'whats-muhtasim-upto');
    assert.equal(GH_PATH, 'kanban.json');
    assert.equal(GH_COMMIT_MESSAGE, 'chore: update kanban board from web');
  });

  it('gets, trims, saves, and clears PAT safely even if storage throws', () => {
    const storage = createMemoryStorage();
    assert.equal(getPat(storage), '');
    assert.equal(savePat('   ', storage), false);
    assert.equal(savePat(null, storage), false);
    assert.equal(savePat('  github_pat_abc123  ', storage), true);
    assert.equal(getPat(storage), 'github_pat_abc123');

    clearPat(storage);
    assert.equal(getPat(storage), '');

    const throwing = createThrowingStorage();
    assert.equal(getPat(throwing), '');
    assert.equal(savePat('github_pat_abc123', throwing), false);
    assert.doesNotThrow(() => clearPat(throwing));
  });

  it('rejects corrupt JSON, non-object drafts, empty drafts, and invalid stages', () => {
    assert.equal(loadLocalDraft(createMemoryStorage({ [KB_STORAGE_KEY]: '{not-json' })), null);
    assert.equal(loadLocalDraft(createMemoryStorage({ [KB_STORAGE_KEY]: '["active"]' })), null);
    assert.equal(loadLocalDraft(createMemoryStorage({ [KB_STORAGE_KEY]: 'null' })), null);
    assert.equal(loadLocalDraft(createMemoryStorage({ [KB_STORAGE_KEY]: '{}' })), null);
    assert.equal(
      loadLocalDraft(createMemoryStorage({ [KB_STORAGE_KEY]: '{"kb-omni":"bogus"}' })),
      null
    );

    const mixed = loadLocalDraft(
      createMemoryStorage({
        [KB_STORAGE_KEY]: JSON.stringify({
          'kb-omni': 'shipped',
          'kb-bad': 'invalid-stage',
          __proto__: 'active',
        }),
      })
    );
    assert.deepEqual(mixed, { 'kb-omni': 'shipped' });
    assert.equal(loadLocalDraft(createThrowingStorage()), null);
  });

  it('saves local draft when stages differ and clears draft when reverted to defaults', () => {
    const storage = createMemoryStorage();
    const modified = DEFAULT_KB_ITEMS.map(item =>
      item.id === 'kb-metapos' ? { ...item, stage: 'shipped' } : { ...item }
    );

    const saved = saveLocalDraft(modified, DEFAULT_KB_ITEMS, storage);
    assert.equal(saved.hasChanges, true);
    assert.equal(loadLocalDraft(storage)['kb-metapos'], 'shipped');

    const reverted = DEFAULT_KB_ITEMS.map(item => ({ ...item }));
    const cleared = saveLocalDraft(reverted, DEFAULT_KB_ITEMS, storage);
    assert.equal(cleared.hasChanges, false);
    assert.equal(loadLocalDraft(storage), null);

    saveLocalDraft(modified, null, storage);
    assert.equal(loadLocalDraft(storage)['kb-metapos'], 'shipped');
    clearLocalDraft(storage);
    assert.equal(loadLocalDraft(storage), null);
  });

  it('mergeKanbanItems does not mutate inputs and ignores invalid/prototype keys', () => {
    const base = [
      { id: 'kb-a', stage: 'scoping', title: 'A' },
      { id: 'kb-b', stage: 'active', title: 'B' },
    ];
    const draft = JSON.parse('{"kb-a":"shipped","kb-b":"bogus","constructor":"testing"}');
    const merged = mergeKanbanItems(base, draft);

    assert.equal(merged[0].stage, 'shipped');
    assert.equal(merged[1].stage, 'active');
    assert.equal(base[0].stage, 'scoping');
  });
});

describe('6. loadKanbanBoard & fetchRemoteSha', () => {
  it('loads remote kanban.json and overlays local draft when present', async () => {
    const storage = createMemoryStorage({
      [KB_STORAGE_KEY]: JSON.stringify({ 'kb-tiktok': 'active' }),
    });
    const requests = [];
    const fetchImpl = async url => {
      requests.push(url);
      return jsonResponse(kanbanJson);
    };

    const result = await loadKanbanBoard({ fetchImpl, storage });
    assert.equal(requests.length, 1);
    assert.ok(requests[0].startsWith('./kanban.json?t='));
    assert.equal(result.source, 'remote');
    assert.equal(result.hasUnsavedChanges, true);
    assert.equal(result.items.find(i => i.id === 'kb-tiktok')?.stage, 'active');

    clearLocalDraft(storage);
    const cleanResult = await loadKanbanBoard({ fetchImpl, storage });
    assert.equal(cleanResult.source, 'remote');
    assert.equal(cleanResult.hasUnsavedChanges, false);
    assert.deepEqual(cleanResult.items, kanbanJson);
  });

  it('falls back cleanly on 404/500, empty array, invalid JSON, or network error', async () => {
    const storage = createMemoryStorage();
    const cases = [
      async () => jsonResponse({}, { ok: false, status: 404 }),
      async () => jsonResponse({}, { ok: false, status: 500 }),
      async () => jsonResponse([]),
      async () => jsonResponse(new SyntaxError('Unexpected token')),
      async () => {
        throw new TypeError('Network failure');
      },
    ];

    for (const fetchImpl of cases) {
      const result = await loadKanbanBoard({ fetchImpl, storage });
      assert.equal(result.source, 'fallback');
      assert.equal(result.hasUnsavedChanges, false);
      assert.deepEqual(result.items, DEFAULT_KB_ITEMS);
    }
  });

  it('fetchRemoteSha returns SHA on 200 and null on missing PAT, 401, or network errors', async () => {
    assert.equal(await fetchRemoteSha({ pat: '', fetchImpl: async () => jsonResponse({ sha: 'x' }) }), null);

    const sha = await fetchRemoteSha({
      pat: ' pat_123 ',
      fetchImpl: async (url, init) => {
        assert.ok(url.startsWith('https://api.github.com/repos/nasif43/whats-muhtasim-upto/contents/kanban.json?t='));
        assert.equal(init.headers.Authorization, 'Bearer pat_123');
        assert.equal(init.headers.Accept, 'application/vnd.github+json');
        return jsonResponse({ sha: 'sha-abc' });
      },
    });
    assert.equal(sha, 'sha-abc');

    assert.equal(
      await fetchRemoteSha({
        pat: 'pat_123',
        fetchImpl: async () => jsonResponse({}, { ok: false, status: 401 }),
      }),
      null
    );
    assert.equal(
      await fetchRemoteSha({
        pat: 'pat_123',
        fetchImpl: async () => {
          throw new Error('offline');
        },
      }),
      null
    );
  });
});

describe('7. saveKanbanToGitHub', () => {
  it('performs GET -> PUT with exact commit message, UTF-8 base64 payload, SHA, and clears draft', async () => {
    const storage = createMemoryStorage({
      [KB_STORAGE_KEY]: JSON.stringify({ 'kb-upgrader': 'shipped' }),
    });
    const updatedItems = DEFAULT_KB_ITEMS.map(item =>
      item.id === 'kb-upgrader' ? { ...item, stage: 'shipped' } : { ...item }
    );
    const calls = [];

    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, init });
      if (!init.method || init.method === 'GET') {
        return jsonResponse({ sha: 'sha-old-123' });
      }
      if (init.method === 'PUT') {
        return jsonResponse({ content: { sha: 'sha-new-456' } });
      }
      throw new Error(`Unexpected method ${init.method}`);
    };

    const result = await saveKanbanToGitHub({
      items: updatedItems,
      pat: ' github_pat_secret ',
      lastKnownSha: 'sha-old-123',
      fetchImpl,
      storage,
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer github_pat_secret');
    assert.equal(calls[1].url, 'https://api.github.com/repos/nasif43/whats-muhtasim-upto/contents/kanban.json');
    assert.equal(calls[1].init.method, 'PUT');

    const putBody = JSON.parse(calls[1].init.body);
    assert.equal(putBody.message, GH_COMMIT_MESSAGE);
    assert.equal(putBody.sha, 'sha-old-123');
    assert.equal(decodeUtf8Base64(putBody.content), `${JSON.stringify(updatedItems, null, 2)}\n`);

    assert.deepEqual(result, {
      sha: 'sha-new-456',
      message: 'Saved to GitHub! Live in ~30s.',
      cancelled: false,
    });
    assert.equal(loadLocalDraft(storage), null);
  });

  it('aborts cleanly without PUT or clearing local draft when SHA differs and confirmOverwrite declines', async () => {
    const storage = createMemoryStorage({
      [KB_STORAGE_KEY]: JSON.stringify({ 'kb-omni': 'shipped' }),
    });
    const calls = [];
    let confirmArgs = null;

    const result = await saveKanbanToGitHub({
      items: DEFAULT_KB_ITEMS,
      pat: 'pat_123',
      lastKnownSha: 'sha-initial',
      confirmOverwrite: async info => {
        confirmArgs = info;
        return false;
      },
      fetchImpl: async (url, init = {}) => {
        calls.push({ url, init });
        return jsonResponse({ sha: 'sha-remote-newer' });
      },
      storage,
    });

    assert.equal(calls.length, 1);
    assert.deepEqual(confirmArgs, {
      remoteSha: 'sha-remote-newer',
      lastKnownSha: 'sha-initial',
    });
    assert.deepEqual(result, {
      sha: 'sha-remote-newer',
      message: 'Save cancelled.',
      cancelled: true,
    });
    assert.deepEqual(loadLocalDraft(storage), { 'kb-omni': 'shipped' });
  });

  it('proceeds with PUT using latest remote SHA when confirmOverwrite approves', async () => {
    const storage = createMemoryStorage({
      [KB_STORAGE_KEY]: JSON.stringify({ 'kb-omni': 'shipped' }),
    });
    const calls = [];

    const result = await saveKanbanToGitHub({
      items: DEFAULT_KB_ITEMS,
      pat: 'pat_123',
      lastKnownSha: 'sha-initial',
      confirmOverwrite: async () => true,
      fetchImpl: async (url, init = {}) => {
        calls.push({ url, init });
        if (!init.method || init.method === 'GET') {
          return jsonResponse({ sha: 'sha-remote-newer' });
        }
        return jsonResponse({ content: { sha: 'sha-final-999' } });
      },
      storage,
    });

    assert.equal(calls.length, 2);
    assert.equal(JSON.parse(calls[1].init.body).sha, 'sha-remote-newer');
    assert.equal(result.cancelled, false);
    assert.equal(result.sha, 'sha-final-999');
    assert.equal(loadLocalDraft(storage), null);
  });

  it('throws clear status-aware errors on HTTP 401/403/404/409/422/429 and network failures without clearing draft', async () => {
    const statuses = [401, 403, 404, 409, 422, 429];

    for (const status of statuses) {
      const storage = createMemoryStorage({
        [KB_STORAGE_KEY]: JSON.stringify({ 'kb-omni': 'shipped' }),
      });

      await assert.rejects(
        () =>
          saveKanbanToGitHub({
            items: DEFAULT_KB_ITEMS,
            pat: 'pat_123',
            fetchImpl: async () => jsonResponse({ message: `Err ${status}` }, { ok: false, status }),
            storage,
          }),
        err => {
          assert.equal(err.status, status);
          assert.match(err.message, new RegExp(`\\(${status}\\)`));
          return true;
        }
      );
      assert.deepEqual(loadLocalDraft(storage), { 'kb-omni': 'shipped' });

      await assert.rejects(
        () =>
          saveKanbanToGitHub({
            items: DEFAULT_KB_ITEMS,
            pat: 'pat_123',
            fetchImpl: async (_url, init = {}) => {
              if (!init.method || init.method === 'GET') {
                return jsonResponse({ sha: 'sha-ok' });
              }
              return jsonResponse({ message: `Put err ${status}` }, { ok: false, status });
            },
            storage,
          }),
        err => {
          assert.equal(err.status, status);
          assert.match(err.message, new RegExp(`\\(${status}\\)`));
          return true;
        }
      );
      assert.deepEqual(loadLocalDraft(storage), { 'kb-omni': 'shipped' });
    }

    const storage = createMemoryStorage({
      [KB_STORAGE_KEY]: JSON.stringify({ 'kb-omni': 'shipped' }),
    });
    await assert.rejects(
      () =>
        saveKanbanToGitHub({
          items: DEFAULT_KB_ITEMS,
          pat: 'pat_123',
          fetchImpl: async () => {
            throw new TypeError('Network unreachable');
          },
          storage,
        }),
      /Network unreachable/
    );
    assert.deepEqual(loadLocalDraft(storage), { 'kb-omni': 'shipped' });
  });
});
