import test from 'node:test';
import assert from 'node:assert/strict';
import { registerGenerateImageTool } from '../src/tools/generate-image.js';
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

function captureRegisteredTool() {
  let captured;
  const server = {
    tool(name, description, schema, handler) {
      captured = { name, description, schema, handler };
    }
  };
  registerGenerateImageTool(server);
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
  assert.equal(tool.schema.size.safeParse('1280x1280').success, true);
  assert.equal(tool.schema.size.safeParse('2048*2048').success, false);
}));
