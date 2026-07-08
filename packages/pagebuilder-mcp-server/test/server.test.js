import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGEBUILDER_MCP_TOOL_NAMES,
  createPageBuilderMcpServer
} from '../src/server.js';

async function withEnv(env, fn) {
  const previousEnv = process.env;
  process.env = { ...env };
  try {
    return await fn();
  }
  finally {
    process.env = previousEnv;
  }
}

test('shared tool registry includes all migrated MCP tools', () => {
  assert.deepEqual(PAGEBUILDER_MCP_TOOL_NAMES, [
    'ui_to_artifact',
    'extract_text_from_screenshot',
    'diagnose_error_screenshot',
    'understand_technical_diagram',
    'analyze_data_visualization',
    'ui_diff_check',
    'analyze_image',
    'analyze_video',
    'generate_image'
  ]);
});

test('server factory registers all migrated tools', async () => withEnv({
  Z_AI_API_KEY: 'sk-zhipu-live'
}, async () => {
  const server = await createPageBuilderMcpServer();

  assert.deepEqual(Object.keys(server._registeredTools), PAGEBUILDER_MCP_TOOL_NAMES);
}));
