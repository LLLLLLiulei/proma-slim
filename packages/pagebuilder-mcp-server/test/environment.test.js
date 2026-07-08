import test from 'node:test';
import assert from 'node:assert/strict';
import { EnvironmentService } from '../src/core/environment.js';

function withEnv(env, fn) {
  const previousEnv = process.env;
  process.env = { ...env };
  try {
    return fn();
  }
  finally {
    process.env = previousEnv;
  }
}

test('defaults to ZHIPU when no platform mode is configured', () => withEnv({
  Z_AI_API_KEY: 'sk-zhipu-live'
}, () => {
  const service = new EnvironmentService();

  assert.equal(service.getPlatformMode(), 'ZHIPU');
  assert.equal(service.getApiKey(), 'sk-zhipu-live');
  assert.equal(service.getVisionConfig().url, 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
}));

test('preserves existing ZAI aliases', () => withEnv({
  PLATFORM_MODE: 'Z_AI',
  Z_AI_API_KEY: 'sk-zai-live'
}, () => {
  const service = new EnvironmentService();

  assert.equal(service.getPlatformMode(), 'ZAI');
  assert.equal(service.getVisionConfig().url, 'https://api.z.ai/api/paas/v4/chat/completions');
}));

test('selects Aliyun without requiring Z_AI_API_KEY', () => withEnv({
  PLATFORM_MODE: 'ALIYUN',
  QWEN_API_KEY: 'sk-qwen-live'
}, () => {
  const service = new EnvironmentService();

  assert.equal(service.getPlatformMode(), 'ALIYUN');
  assert.equal(service.getApiKey(), 'sk-qwen-live');
  assert.equal(service.getVisionConfig().model, 'qwen3-vl-plus');
  assert.equal(service.getVisionConfig().url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
  assert.equal(service.getImageGenConfig().model, 'qwen-image-2.0-pro');
  assert.equal(service.getImageGenConfig().size, '2048*2048');
}));

test('resolves Aliyun key priority and workspace regional endpoints', () => withEnv({
  PLATFORM_MODE: 'ALIYUN',
  DASHSCOPE_API_KEY: 'sk-dashscope-live',
  QWEN_API_KEY: 'sk-qwen-live',
  ALIYUN_API_KEY: 'sk-aliyun-live',
  ALIYUN_WORKSPACE_ID: 'ws123',
  ALIYUN_REGION: 'ap-southeast-1'
}, () => {
  const service = new EnvironmentService();

  assert.equal(service.getApiKey(), 'sk-aliyun-live');
  assert.equal(
    service.getVisionConfig().url,
    'https://ws123.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions'
  );
  assert.equal(
    service.getImageGenConfig().url,
    'https://ws123.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
  );
}));

test('uses PageBuilder MCP server identity by default', () => withEnv({
  Z_AI_API_KEY: 'sk-zhipu-live'
}, () => {
  const service = new EnvironmentService();

  assert.equal(service.getServerConfig().name, 'pagebuilder-mcp-server');
  assert.equal(service.getServerConfig().version, '0.1.0');
}));

test('resolves PageBuilder MCP HTTP runtime config', () => withEnv({
  Z_AI_API_KEY: 'sk-zhipu-live',
  PAGEBUILDER_MCP_HOST: '127.0.0.1',
  PAGEBUILDER_MCP_PORT: '3888',
  PAGEBUILDER_MCP_PATH: 'custom-mcp',
  PAGEBUILDER_MCP_LOG_PATH: '/tmp/pagebuilder-mcp-server.log'
}, () => {
  const service = new EnvironmentService();

  assert.deepEqual(service.getHttpConfig(), {
    host: '127.0.0.1',
    port: 3888,
    path: '/custom-mcp',
    logPath: '/tmp/pagebuilder-mcp-server.log'
  });
}));

test('uses default PageBuilder MCP HTTP runtime config', () => withEnv({
  Z_AI_API_KEY: 'sk-zhipu-live'
}, () => {
  const service = new EnvironmentService();

  assert.deepEqual(service.getHttpConfig(), {
    host: '0.0.0.0',
    port: 3000,
    path: '/mcp',
    logPath: undefined
  });
}));

test('resolves MCP server identity and HTTP config without provider secret', () => withEnv({}, () => {
  const service = new EnvironmentService();

  assert.deepEqual(service.getServerConfig(), {
    name: 'pagebuilder-mcp-server',
    version: '0.1.0'
  });
  assert.deepEqual(service.getHttpConfig(), {
    host: '0.0.0.0',
    port: 3000,
    path: '/mcp',
    logPath: undefined
  });
}));
