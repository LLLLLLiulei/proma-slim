import test from 'node:test';
import assert from 'node:assert/strict';
import { startHttpServer } from '../src/http.js';
import { PAGEBUILDER_MCP_TOOL_NAMES } from '../src/server.js';

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

async function withHttpServer(env, fn) {
  return withEnv(env, async () => {
    const runtime = await startHttpServer({
      host: '127.0.0.1',
      port: 0,
      path: '/mcp',
      redirectConsole: false
    });
    try {
      const address = runtime.server.address();
      assert.equal(typeof address, 'object');
      return await fn(`http://127.0.0.1:${address.port}`);
    }
    finally {
      await runtime.close();
    }
  });
}

test('HTTP server exposes health endpoint', async () => {
  await withHttpServer({ Z_AI_API_KEY: 'sk-zhipu-live' }, async (origin) => {
    const response = await fetch(`${origin}/healthz`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type')?.includes('application/json'), true);
    assert.deepEqual(await response.json(), {
      ok: true,
      name: 'pagebuilder-mcp-server'
    });
  });
});

test('HTTP health endpoint does not require provider secret', async () => {
  await withHttpServer({}, async (origin) => {
    const response = await fetch(`${origin}/healthz`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      name: 'pagebuilder-mcp-server'
    });
  });
});

test('HTTP MCP endpoint handles initialize request', async () => {
  await withHttpServer({ Z_AI_API_KEY: 'sk-zhipu-live' }, async (origin) => {
    const response = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'pagebuilder-mcp-server-test',
            version: '0.1.0'
          }
        }
      })
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('mcp-session-id') !== null, true);
    const result = await response.json();
    assert.equal(result.jsonrpc, '2.0');
    assert.equal(result.id, 1);
    assert.equal(result.result.serverInfo.name, 'pagebuilder-mcp-server');
  });
});

test('HTTP MCP endpoint lists migrated tools after initialization', async () => {
  await withHttpServer({ Z_AI_API_KEY: 'sk-zhipu-live' }, async (origin) => {
    const initializeResponse = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'pagebuilder-mcp-server-test',
            version: '0.1.0'
          }
        }
      })
    });
    const sessionId = initializeResponse.headers.get('mcp-session-id');
    assert.equal(initializeResponse.status, 200);
    assert.equal(typeof sessionId, 'string');

    const listResponse = await fetch(`${origin}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-session-id': sessionId,
        'mcp-protocol-version': '2025-03-26'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      })
    });

    assert.equal(listResponse.status, 200);
    const result = await listResponse.json();
    assert.deepEqual(
      result.result.tools.map((tool) => tool.name),
      PAGEBUILDER_MCP_TOOL_NAMES
    );
  });
});
