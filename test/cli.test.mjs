// Path-traversal & slug-disambiguation matrix.
// These functions are the security boundary of the HTTP API: every session
// resolution flows through `parseSlug` → `resolveSessionDir` → `safeJoin`.
// A regression here would silently 404 sessions or escape the log root.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import {
  encodeProject,
  parseSlug,
  resolveSessionDir,
  safeJoin,
  classify,
  dirHasSessionFiles,
  summarizeSessionDir,
  listSessions,
} from '../bin/claude-otel.mjs';

// ─── parseSlug ──────────────────────────────────────────────────────────

test('parseSlug splits on first slash', () => {
  assert.deepEqual(
    parseSlug('-Users-iris-foo/2026-04-26_10-00-00'),
    { project: '-Users-iris-foo', session: '2026-04-26_10-00-00' }
  );
});

test('parseSlug treats no-slash as legacy session', () => {
  assert.deepEqual(
    parseSlug('2026-04-26_10-00-00'),
    { project: null, session: '2026-04-26_10-00-00' }
  );
});

test('parseSlug uses the FIRST slash as the boundary', () => {
  // Encoded projects can't contain `/` and timestamps can't contain `/`,
  // so this case shouldn't occur in practice, but we want deterministic
  // behaviour if it ever did.
  assert.deepEqual(parseSlug('a/b/c'), { project: 'a', session: 'b/c' });
});

// ─── encodeProject ──────────────────────────────────────────────────────

test('encodeProject collapses path separators to dashes', () => {
  assert.equal(encodeProject('/Users/iris/dev/foo'), '-Users-iris-dev-foo');
});

test('encodeProject preserves existing dashes (lossy but stable)', () => {
  // "/Users/iris/dev/claude-otel" and "/Users/iris/dev/claude/otel"
  // collapse to the same encoded name. Acceptable: viewer reads the
  // .project file for display, and same-encoding/different-cwd is rare
  // enough to live with.
  assert.equal(
    encodeProject('/Users/iris/dev/claude-otel'),
    '-Users-iris-dev-claude-otel'
  );
});

test('encodeProject leaves colons literal — slug delimiter is `/`, so safe', () => {
  // Regression test for the old C2 bug: `:` in cwd used to corrupt slug
  // parsing. With the delimiter changed to `/`, colons are inert.
  const enc = encodeProject('/Users/foo/bar:baz');
  assert.equal(enc, '-Users-foo-bar:baz');
  assert.deepEqual(
    parseSlug(enc + '/2026-04-26_10-00-00'),
    { project: enc, session: '2026-04-26_10-00-00' }
  );
});

// ─── safeJoin ───────────────────────────────────────────────────────────

test('safeJoin allows a normal child', () => {
  const root = path.resolve(os.tmpdir());
  assert.equal(safeJoin(root, 'foo'), path.join(root, 'foo'));
});

test('safeJoin allows a nested child', () => {
  const root = path.resolve(os.tmpdir());
  assert.equal(safeJoin(root, 'foo/bar'), path.join(root, 'foo', 'bar'));
});

test('safeJoin rejects path traversal via ..', () => {
  assert.equal(safeJoin('/tmp/root', '../escape'), null);
  assert.equal(safeJoin('/tmp/root', '../../etc/passwd'), null);
});

test('safeJoin rejects mid-path traversal', () => {
  assert.equal(safeJoin('/tmp/root', 'foo/../../escape'), null);
});

test('safeJoin rejects exact equality with base', () => {
  assert.equal(safeJoin('/tmp/root', '.'), null);
});

test('safeJoin rejects empty name', () => {
  assert.equal(safeJoin('/tmp/root', ''), null);
});

test('safeJoin rejects NUL byte in name', () => {
  assert.equal(safeJoin('/tmp/root', 'foo\0bar'), null);
});

test('safeJoin rejects non-string input', () => {
  assert.equal(safeJoin('/tmp/root', null), null);
  assert.equal(safeJoin('/tmp/root', undefined), null);
  assert.equal(safeJoin('/tmp/root', 42), null);
});

test('safeJoin rejects absolute paths that escape the base', () => {
  // path.resolve('/tmp/root', '/etc/passwd') === '/etc/passwd'
  assert.equal(safeJoin('/tmp/root', '/etc/passwd'), null);
});

// ─── resolveSessionDir ──────────────────────────────────────────────────

test('resolveSessionDir resolves project/session under root', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
  try {
    const projDir = path.join(tmp, '-Users-iris-foo');
    const sessDir = path.join(projDir, '2026-04-26_10-00-00');
    fs.mkdirSync(sessDir, { recursive: true });
    assert.equal(
      resolveSessionDir(tmp, '-Users-iris-foo/2026-04-26_10-00-00'),
      sessDir
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveSessionDir resolves legacy (no project) session', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
  try {
    const sessDir = path.join(tmp, '2026-04-26_10-00-00');
    fs.mkdirSync(sessDir);
    assert.equal(
      resolveSessionDir(tmp, '2026-04-26_10-00-00'),
      sessDir
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('resolveSessionDir rejects traversal in project segment', () => {
  assert.equal(resolveSessionDir('/tmp/root', '../etc/passwd'), null);
});

test('resolveSessionDir rejects traversal in session segment', () => {
  assert.equal(resolveSessionDir('/tmp/root', 'proj/../../escape'), null);
});

test('resolveSessionDir rejects empty session after slash', () => {
  assert.equal(resolveSessionDir('/tmp/root', 'proj/'), null);
});

test('resolveSessionDir rejects empty project before slash', () => {
  // safeJoin will reject the empty project segment.
  assert.equal(resolveSessionDir('/tmp/root', '/sess'), null);
});

// ─── classify ───────────────────────────────────────────────────────────

test('classify recognises request / response / other', () => {
  assert.equal(classify('abc.request.json'), 'request');
  assert.equal(classify('abc.response.json'), 'response');
  assert.equal(classify('notes.json'), 'other');
  assert.equal(classify('abc.request.json.bak'), 'other');
});

// ─── dirHasSessionFiles ─────────────────────────────────────────────────

test('dirHasSessionFiles only matches request/response JSONs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
  try {
    fs.writeFileSync(path.join(tmp, 'notes.json'), '{}');
    assert.equal(dirHasSessionFiles(tmp), false);
    fs.writeFileSync(path.join(tmp, 'abc.request.json'), '{}');
    assert.equal(dirHasSessionFiles(tmp), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── listSessions: project layout + legacy mix ──────────────────────────

test('listSessions handles project layout, legacy layout, and mixed roots', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
  try {
    // Project layout
    const projDir = path.join(tmp, '-Users-iris-foo');
    const sess1 = path.join(projDir, '2026-04-26_10-00-00');
    fs.mkdirSync(sess1, { recursive: true });
    fs.writeFileSync(path.join(projDir, '.project'), '/Users/iris/foo\n');
    fs.writeFileSync(path.join(sess1, 'a.request.json'), '{}');
    fs.writeFileSync(path.join(sess1, 'a.response.json'), '{}');

    // Legacy session at root
    const legacy = path.join(tmp, '2026-04-25_15-00-00');
    fs.mkdirSync(legacy);
    fs.writeFileSync(path.join(legacy, 'b.request.json'), '{}');
    fs.writeFileSync(path.join(legacy, 'b.response.json'), '{}');

    const sessions = listSessions(tmp);
    const ids = sessions.map(s => s.id).sort();
    assert.deepEqual(ids, [
      '-Users-iris-foo/2026-04-26_10-00-00',
      '2026-04-25_15-00-00',
    ]);

    const projSession = sessions.find(s => s.project);
    assert.equal(projSession.projectPath, '/Users/iris/foo');
    assert.equal(projSession.projectLabel, 'foo');

    const legacySession = sessions.find(s => !s.project);
    assert.equal(legacySession.id, legacySession.name);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('listSessions ignores non-session JSONs in project dirs', () => {
  // Regression: I4 — a stray notes.json in a project dir used to make
  // listSessions classify the entire project as a single legacy session,
  // hiding all real session subdirs.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
  try {
    const projDir = path.join(tmp, '-Users-iris-foo');
    const sess = path.join(projDir, '2026-04-26_10-00-00');
    fs.mkdirSync(sess, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'notes.json'), '{}');  // distractor
    fs.writeFileSync(path.join(sess, 'a.request.json'), '{}');
    fs.writeFileSync(path.join(sess, 'a.response.json'), '{}');

    const sessions = listSessions(tmp);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, '-Users-iris-foo/2026-04-26_10-00-00');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ─── summarizeSessionDir ────────────────────────────────────────────────

test('summarizeSessionDir returns null for empty dirs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
  try {
    assert.equal(summarizeSessionDir(tmp, null, null, 'x'), null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('summarizeSessionDir produces id from project + name', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
  try {
    fs.writeFileSync(path.join(tmp, 'a.request.json'), '{}');
    fs.writeFileSync(path.join(tmp, 'a.response.json'), '{}');
    const sess = summarizeSessionDir(tmp, '-Users-iris-foo', '/Users/iris/foo', 'ts');
    assert.equal(sess.id, '-Users-iris-foo/ts');
    assert.equal(sess.projectLabel, 'foo');
    assert.equal(sess.turns, 1);
    assert.equal(sess.requests, 1);
    assert.equal(sess.responses, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
