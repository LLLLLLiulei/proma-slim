import test from 'node:test';
import assert from 'node:assert/strict';
import { BaseImageAnalysisService } from '../src/core/base-image-service.js';
import { configurationService } from '../src/core/environment.js';

function withEnv(env, fn) {
  const previousEnv = process.env;
  process.env = { ...env };
  configurationService.config = null;
  try {
    return fn();
  }
  finally {
    configurationService.config = null;
    process.env = previousEnv;
  }
}

test('Aliyun image analysis folds system prompt into user multimodal message', async () => withEnv({
  PLATFORM_MODE: 'ALIYUN',
  QWEN_API_KEY: 'sk-qwen-live'
}, async () => {
  const service = new BaseImageAnalysisService();
  let capturedMessages;
  service.chatService = {
    async visionCompletions(messages) {
      capturedMessages = messages;
      return 'ok';
    }
  };

  const result = await service.executeVisionAnalysis(
    'SYSTEM INSTRUCTIONS',
    'USER REQUEST',
    [{ type: 'image_url', image_url: { url: 'https://example.com/a.png' } }],
    'test-tool'
  );

  assert.equal(result, 'ok');
  assert.equal(capturedMessages.length, 1);
  assert.equal(capturedMessages[0].role, 'user');
  assert.match(capturedMessages[0].content.at(-1).text, /SYSTEM INSTRUCTIONS/);
  assert.match(capturedMessages[0].content.at(-1).text, /USER REQUEST/);
}));

test('ZHIPU image analysis keeps system message', async () => withEnv({
  PLATFORM_MODE: 'ZHIPU',
  Z_AI_API_KEY: 'sk-zhipu-live'
}, async () => {
  const service = new BaseImageAnalysisService();
  let capturedMessages;
  service.chatService = {
    async visionCompletions(messages) {
      capturedMessages = messages;
      return 'ok';
    }
  };

  await service.executeVisionAnalysis(
    'SYSTEM INSTRUCTIONS',
    'USER REQUEST',
    [{ type: 'image_url', image_url: { url: 'https://example.com/a.png' } }],
    'test-tool'
  );

  assert.equal(capturedMessages[0].role, 'system');
  assert.equal(capturedMessages[0].content, 'SYSTEM INSTRUCTIONS');
}));
