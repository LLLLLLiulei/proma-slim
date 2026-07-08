import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageGenerationService } from '../src/core/image-generation-service.js';
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

test('Aliyun image generation calls Qwen Image native endpoint and parses image URL', async () => withEnv({
  PLATFORM_MODE: 'ALIYUN',
  QWEN_API_KEY: 'sk-qwen-live',
  ALIYUN_IMAGE_NEGATIVE_PROMPT: 'low quality',
  ALIYUN_IMAGE_PROMPT_EXTEND: 'false',
  ALIYUN_IMAGE_WATERMARK: 'true'
}, async () => {
  const service = new ImageGenerationService();
  let captured;
  service.callImageApi = async (url, body) => {
    captured = { url, body };
    return {
      output: {
        choices: [
          {
            message: {
              content: [{ image: 'https://dashscope-result.example/image.png?Expires=1' }]
            }
          }
        ]
      }
    };
  };

  const imageUrl = await service.generateImage('生成一张海报', '1024*1024');

  assert.equal(imageUrl, 'https://dashscope-result.example/image.png?Expires=1');
  assert.equal(captured.url, 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
  assert.equal(captured.body.model, 'qwen-image-2.0-pro');
  assert.deepEqual(captured.body.input.messages, [
    { role: 'user', content: [{ text: '生成一张海报' }] }
  ]);
  assert.deepEqual(captured.body.parameters, {
    size: '1024*1024',
    prompt_extend: false,
    watermark: true,
    negative_prompt: 'low quality'
  });
}));

test('Aliyun image generation rejects unsupported size before API call', async () => withEnv({
  PLATFORM_MODE: 'ALIYUN',
  QWEN_API_KEY: 'sk-qwen-live'
}, async () => {
  const service = new ImageGenerationService();
  service.callImageApi = async () => {
    throw new Error('API should not be called');
  };

  await assert.rejects(
    service.generateImage('prompt', '4096*4096'),
    /Invalid Aliyun image size/
  );
}));

test('ZHIPU image generation keeps existing GLM Images API shape', async () => withEnv({
  PLATFORM_MODE: 'ZHIPU',
  Z_AI_API_KEY: 'sk-zhipu-live'
}, async () => {
  const service = new ImageGenerationService();
  let captured;
  service.callImageApi = async (url, body) => {
    captured = { url, body };
    return { data: [{ url: 'https://zhipu.example/image.png' }] };
  };

  const imageUrl = await service.generateImage('prompt', '1280x1280');

  assert.equal(imageUrl, 'https://zhipu.example/image.png');
  assert.equal(captured.url, 'https://open.bigmodel.cn/api/paas/v4/images/generations');
  assert.deepEqual(captured.body, {
    model: 'glm-image',
    prompt: 'prompt',
    size: '1280x1280'
  });
}));
