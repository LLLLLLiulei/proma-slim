import test from 'node:test';
import assert from 'node:assert/strict';
import { registerGenerateImageTool } from '../src/tools/generate-image.js';
import { configurationService } from '../src/core/environment.js';
import { imageGenerationService } from '../src/core/image-generation-service.js';

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

function captureRegisteredTool(options) {
  let captured;
  const server = {
    tool(name, description, schema, handler) {
      captured = { name, description, schema, handler };
    }
  };
  registerGenerateImageTool(server, options);
  return captured;
}

test('Aliyun generate_image tool uses Qwen Image description and size schema', () => withEnv({
  PLATFORM_MODE: 'ALIYUN',
  QWEN_API_KEY: 'sk-qwen-live'
}, () => {
  const tool = captureRegisteredTool();

  assert.equal(tool.name, 'generate_image');
  assert.match(tool.description, /qwen-image-2\.0-pro/);
  assert.match(tool.description, /24 hours/);
  assert.doesNotMatch(tool.description, /embedded/i);
  assert.doesNotMatch(tool.description, /accurate .*text/i);
  assert.match(tool.schema.prompt.description, /Do not/i);
  assert.match(tool.schema.prompt.description, /HTML\/CSS/i);
  assert.doesNotMatch(tool.schema.prompt.description, /text to render/i);
  assert.equal(tool.schema.provider, undefined);
  assert.equal(tool.schema.model, undefined);
  assert.equal(tool.schema.provider_options, undefined);
  assert.equal(tool.schema.size.safeParse('2048*2048').success, true);
  assert.equal(tool.schema.size.safeParse('1280x1280').success, false);
}));

test('ZHIPU generate_image tool keeps GLM Image size schema', () => withEnv({
  PLATFORM_MODE: 'ZHIPU',
  Z_AI_API_KEY: 'sk-zhipu-live'
}, () => {
  const tool = captureRegisteredTool();

  assert.match(tool.description, /GLM-Image/);
  assert.doesNotMatch(tool.description, /embedded/i);
  assert.doesNotMatch(tool.description, /SOTA at text rendering/i);
  assert.match(tool.schema.prompt.description, /Do not/i);
  assert.match(tool.schema.prompt.description, /HTML\/CSS/i);
  assert.equal(tool.schema.size.safeParse('1280x1280').success, true);
  assert.equal(tool.schema.size.safeParse('2048*2048').success, false);
}));

test('generate_image can return workspace asset metadata through an optional sink', async () => withEnv({
  PLATFORM_MODE: 'ZHIPU',
  Z_AI_API_KEY: 'sk-zhipu-live'
}, async () => {
  const originalGenerateImage = imageGenerationService.generateImage;
  imageGenerationService.generateImage = async () => 'https://cdn.example/generated.png';
  try {
    const tool = captureRegisteredTool({
      assetSink: async (imageUrl) => ({
        imageUrl,
        assetFileName: 'generated-banner.png',
        assetRelativePath: 'assets/generated-banner.png',
        assetPreviewPath: './assets/generated-banner.png',
        width: 1280,
        height: 720,
        contentType: 'image/png',
        byteLength: 2048
      })
    });

    const result = await tool.handler({ prompt: 'Clean industrial training conference banner without text', size: '1280x1280' });
    const text = result.content[0].text;

    assert.match(text, /generated-banner\.png/);
    assert.match(text, /\.\/assets\/generated-banner\.png/);
    assert.match(text, /https:\/\/cdn\.example\/generated\.png/);
  }
  finally {
    imageGenerationService.generateImage = originalGenerateImage;
  }
}));
