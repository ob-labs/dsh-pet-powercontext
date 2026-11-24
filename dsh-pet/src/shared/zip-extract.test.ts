import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { extractZip, extractZipWithTar, probeTar } from './zip-extract.ts';

// 仅包含两个文本文件的 ZIP 夹具，无需外部解包工具即可校验解压结果。
const ZIP_FIXTURE =
  'UEsDBBQAAAAAADy2d12NyacLEgAAABIAAAAZAAAAdXYtMC45LjI2LmRhdGEvc2NyaXB0cy91dmZpeHR1cmUgZXhlY3V0YWJsZVBLAwQUAAAAAAA8tnddjcmnCxIAAAASAAAAHQAAAHV2LTAuOS4yNi5kYXRhL3NjcmlwdHMvdXYuZXhlZml4dHVyZSBleGVjdXRhYmxlUEsBAhQDFAAAAAAAPLZ3XY3JpwsSAAAAEgAAABkAAAAAAAAAAAAAAIABAAAAAHV2LTAuOS4yNi5kYXRhL3NjcmlwdHMvdXZQSwECFAMUAAAAAAA8tnddjcmnCxIAAAASAAAAHQAAAAAAAAAAAAAAgAFJAAAAdXYtMC45LjI2LmRhdGEvc2NyaXB0cy91di5leGVQSwUGAAAAAAIAAgCSAAAAlgAAAAAA';

test('tar probe reports the command it checked', async () => {
  const probe = await probeTar('tar-does-not-exist');
  assert.equal(probe.usable, false);
  assert.equal(probe.command, 'tar-does-not-exist');
});

test('tar probe accepts a working system extractor', async (t) => {
  const probe = await probeTar();
  if (!probe.usable) {
    t.skip('no system tar on this host');
    return;
  }
  assert.equal(probe.command, 'tar');
});

test('tar extraction fails loudly when the archive is not a zip', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pet-zip-bad-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const archive = join(directory, 'broken.zip');
  const target = join(directory, 'out');
  mkdirSync(target);
  writeFileSync(archive, 'not a zip at all');
  await assert.rejects(extractZipWithTar(archive, target));
  assert.deepEqual(readdirSync(target), []);
});

test('tar extraction reports a missing command instead of hanging', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pet-zip-missing-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const archive = join(directory, 'fixture.zip');
  const target = join(directory, 'out');
  mkdirSync(target);
  writeFileSync(archive, Buffer.from(ZIP_FIXTURE, 'base64'));
  await assert.rejects(extractZipWithTar(archive, target, { command: 'tar-does-not-exist' }), /tar_missing/);
});

test('tar extraction reports a failed extraction with a reason', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pet-zip-reason-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const archive = join(directory, 'fixture.zip');
  const target = join(directory, 'missing-target');
  writeFileSync(archive, Buffer.from(ZIP_FIXTURE, 'base64'));
  // 目标目录不存在时 tar 无法写入，必须报错而不是静默成功。
  await assert.rejects(extractZipWithTar(archive, target), /tar_failed/);
});

test('zip extraction publishes the archived files', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pet-zip-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const archive = join(directory, 'fixture.zip');
  const target = join(directory, 'out');
  mkdirSync(target);
  writeFileSync(archive, Buffer.from(ZIP_FIXTURE, 'base64'));
  const extractor = await extractZip(archive, target);
  assert.ok(extractor === 'tar' || extractor === 'native');
  assert.equal(readFileSync(join(target, 'uv-0.9.26.data', 'scripts', 'uv.exe'), 'utf8'), 'fixture executable');
});

test('zip extraction keeps an aborted signal aborted', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'pet-zip-abort-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const archive = join(directory, 'fixture.zip');
  const target = join(directory, 'out');
  mkdirSync(target);
  writeFileSync(archive, Buffer.from(ZIP_FIXTURE, 'base64'));
  const controller = new AbortController();
  controller.abort(new Error('aborted by test'));
  await assert.rejects(extractZip(archive, target, { signal: controller.signal }));
  assert.equal(existsSync(join(target, 'uv-0.9.26.data')), false);
});
