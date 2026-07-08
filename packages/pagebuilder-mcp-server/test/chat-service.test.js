import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatService } from '../src/core/chat-service.js';
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

test('Aliyun vision request uses OpenAI-compatible body without ZHIPU thinking field', async () => withEnv({
  PLATFORM_MODE: 'ALIYUN',
  QWEN_API_KEY: 'sk-qwen-live',
  ALIYUN_ENABLE_THINKING: 'true',
  ALIYUN_THINKING_BUDGET: '1024',
  ALIYUN_VL_HIGH_RESOLUTION_IMAGES: 'true'
}, async () => {
  const service = new ChatService();
  let captured;
  service.chatCompletions = async (url, body) => {
    captured = { url, body };
    return { choices: [{ message: { content: 'ok' } }] };
  };

  const result = await service.visionCompletions([
    {
      role: 'user',
      content: [
        { type: 'text', text: 'describe' },
        { type: 'image_url', image_url: { url: 'https://example.com/a.png' } }
      ]
    }
  ]);

  assert.equal(result, 'ok');
  assert.equal(captured.url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
  assert.equal(captured.body.model, 'qwen3-vl-plus');
  assert.equal(captured.body.stream, false);
  assert.equal(captured.body.thinking, undefined);
  assert.equal(captured.body.enable_thinking, true);
  assert.equal(captured.body.thinking_budget, 1024);
  assert.equal(captured.body.vl_high_resolution_images, true);
}));

test('ZHIPU vision request keeps existing thinking field', async () => withEnv({
  PLATFORM_MODE: 'ZHIPU',
  Z_AI_API_KEY: 'sk-zhipu-live'
}, async () => {
  const service = new ChatService();
  let captured;
  service.chatCompletions = async (url, body) => {
    captured = { url, body };
    return { choices: [{ message: { content: 'ok' } }] };
  };

  await service.visionCompletions([{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]);

  assert.equal(captured.url, 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
  assert.deepEqual(captured.body.thinking, { type: 'enabled' });
}));
