import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileService } from '../src/core/file-service.js';

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

function tempImage(extension = '.png') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-image-'));
  const file = path.join(dir, `image${extension}`);
  fs.writeFileSync(file, ONE_BY_ONE_PNG);
  return { dir, file };
}

test('remote image URL is preserved without base64 encoding', async () => {
  const url = 'https://example.com/image.png';

  assert.equal(await FileService.encodeImageToBase64(url), url);
});

test('local image is encoded as data URL', async () => {
  const { dir, file } = tempImage();
  try {
    const result = await FileService.encodeImageToBase64(file);

    assert.match(result, /^data:image\/png;base64,/);
  }
  finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('oversized local image is compressed once before base64 encoding', async () => {
  const { dir, file } = tempImage();
  try {
    const result = await FileService.encodeImageToBase64(file, {
      compressIfOverBytes: 1,
      maxBase64Bytes: 100_000
    });

    assert.match(result, /^data:image\/jpeg;base64,/);
  }
  finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compressed image still over limit fails without upload fallback', async () => {
  const { dir, file } = tempImage();
  try {
    await assert.rejects(
      FileService.encodeImageToBase64(file, {
        compressIfOverBytes: 1,
        maxBase64Bytes: 10
      }),
      /Image remains too large after compression/
    );
  }
  finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
