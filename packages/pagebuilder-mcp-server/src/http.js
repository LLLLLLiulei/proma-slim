#!/usr/bin/env node
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { configurationService } from './core/environment.js';
import { handleError } from './core/error-handler.js';
import { setupConsoleRedirection } from './utils/logger.js';
import { createPageBuilderMcpServer } from './server.js';

function sendJson(res, statusCode, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(statusCode, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body)
    });
    res.end(body);
}

function normalizePath(path) {
    if (!path || path === '/') {
        return '/';
    }
    return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

function resolveRequestPath(req) {
    const host = req.headers.host || 'localhost';
    return normalizePath(new URL(req.url || '/', `http://${host}`).pathname);
}

export function createHttpRequestHandler(options = {}) {
    const mcpPath = normalizePath(options.path || configurationService.getHttpConfig().path);
    const createServer = options.createServer || createPageBuilderMcpServer;
    const sessions = new Map();

    const closeSession = async (sessionId) => {
        const session = sessions.get(sessionId);
        if (!session) {
            return;
        }
        sessions.delete(sessionId);
        await session.server.close();
        await session.transport.close();
    };

    const createSession = async () => {
        let sessionId;
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: randomUUID,
            enableJsonResponse: true,
            onsessioninitialized: (newSessionId) => {
                sessionId = newSessionId;
            },
            onsessionclosed: async (closedSessionId) => {
                await closeSession(closedSessionId);
            }
        });
        const server = await createServer();
        await server.connect(transport);
        return {
            get sessionId() {
                return sessionId;
            },
            server,
            transport
        };
    };

    const findSession = (req) => {
        const rawSessionId = req.headers['mcp-session-id'];
        const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
        return sessionId ? sessions.get(sessionId) : undefined;
    };

    const handle = async (req, res) => {
        try {
            const requestPath = resolveRequestPath(req);
            if (requestPath === '/healthz' && req.method === 'GET') {
                sendJson(res, 200, {
                    ok: true,
                    name: configurationService.getServerConfig().name
                });
                return;
            }

            if (requestPath !== mcpPath) {
                sendJson(res, 404, {
                    ok: false,
                    error: 'Not found'
                });
                return;
            }

            if (!['GET', 'POST', 'DELETE'].includes(req.method || '')) {
                res.writeHead(405, {
                    allow: 'GET, POST, DELETE'
                });
                res.end();
                return;
            }

            let session = findSession(req);
            if (!session) {
                if (req.method !== 'POST') {
                    sendJson(res, 404, {
                        ok: false,
                        error: 'MCP session not found'
                    });
                    return;
                }
                session = await createSession();
            }

            await session.transport.handleRequest(req, res);
            if (session.sessionId && !sessions.has(session.sessionId)) {
                sessions.set(session.sessionId, session);
            }
        }
        catch (error) {
            const standardError = await handleError(error, {
                operation: 'http-request',
                metadata: { component: 'PageBuilderMcpHttpServer' }
            });
            console.error('HTTP MCP request failed:', standardError);
            if (!res.headersSent) {
                sendJson(res, 500, {
                    ok: false,
                    error: 'Internal server error'
                });
            }
            else {
                res.end();
            }
        }
    };

    const close = async () => {
        const sessionIds = Array.from(sessions.keys());
        for (const sessionId of sessionIds) {
            await closeSession(sessionId);
        }
    };

    return {
        handle,
        close,
        mcpPath
    };
}

export async function startHttpServer(overrides = {}) {
    if (overrides.redirectConsole !== false) {
        setupConsoleRedirection();
    }

    const envConfig = configurationService.getHttpConfig();
    const host = overrides.host || envConfig.host;
    const port = overrides.port ?? envConfig.port;
    const path = overrides.path || envConfig.path;
    const requestHandler = createHttpRequestHandler({
        path,
        createServer: overrides.createServer
    });
    const server = http.createServer((req, res) => {
        void requestHandler.handle(req, res);
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.off('error', reject);
            resolve();
        });
    });

    console.info('PageBuilder MCP HTTP server started successfully', {
        host,
        port: server.address()?.port ?? port,
        path,
        name: configurationService.getServerConfig().name
    });

    return {
        server,
        requestHandler,
        close: async () => {
            await requestHandler.close();
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        }
    };
}

function setupProcessErrorHandling(runtime) {
    const shutdown = async (signal) => {
        try {
            console.info(`Received ${signal}, shutting down HTTP server gracefully...`);
            await runtime.close();
            process.exit(0);
        }
        catch (error) {
            console.error('Error during HTTP server shutdown:', { error });
            process.exit(1);
        }
    };
    process.on('SIGINT', () => {
        void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
        void shutdown('SIGTERM');
    });
}

async function main() {
    try {
        const runtime = await startHttpServer();
        setupProcessErrorHandling(runtime);
    }
    catch (error) {
        const standardError = await handleError(error, {
            operation: 'http-server-start',
            metadata: { component: 'PageBuilderMcpHttpServer' }
        });
        console.error('HTTP MCP server startup failed:', standardError);
        process.exit(1);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    void main();
}
