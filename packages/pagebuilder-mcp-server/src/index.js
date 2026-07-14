#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { configurationService } from './core/environment.js';
import { handleError } from './core/error-handler.js';
import { setupConsoleRedirection } from './utils/logger.js';
import { McpError } from './types/index.js';
import { createPageBuilderMcpServer } from './server.js';

function setupProcessErrorHandling() {
    process.on('uncaughtException', async (error) => {
        const standardError = await handleError(error, {
            operation: 'uncaughtException',
            metadata: { source: 'process' }
        });
        console.error('Uncaught exception:', standardError);
        process.exit(1);
    });
    process.on('unhandledRejection', async (reason) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        const standardError = await handleError(error, {
            operation: 'unhandledRejection',
            metadata: { source: 'process' }
        });
        console.error('Unhandled Promise rejection:', standardError);
        process.exit(1);
    });
}

function setupSignalHandling(server) {
    const shutdown = async (signal) => {
        try {
            console.info(`Received ${signal}, shutting down gracefully...`);
            await server.close();
            process.exit(0);
        }
        catch (error) {
            console.error('Error during graceful shutdown:', { error });
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

export async function startStdioServer() {
    setupConsoleRedirection();
    setupProcessErrorHandling();

    console.info('Starting PageBuilder MCP stdio server...');
    const server = await createPageBuilderMcpServer();
    setupSignalHandling(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.info('PageBuilder MCP stdio server started successfully', {
        mode: configurationService.getPlatformMode(),
        name: configurationService.getServerConfig().name,
        version: configurationService.getServerConfig().version
    });
    return server;
}

async function main() {
    try {
        await startStdioServer();
    }
    catch (error) {
        if (error instanceof McpError) {
            console.error('Application startup failed:', { message: error.message });
        }
        else {
            console.error('Application startup failed:', { error });
        }
        process.exit(1);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    void main();
}
