import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { configurationService } from './core/environment.js';
import { handleError } from './core/error-handler.js';
import { registerUiToArtifactTool } from './tools/ui-to-artifact.js';
import { registerTextExtractionTool } from './tools/text-extraction.js';
import { registerErrorDiagnosisTool } from './tools/error-diagnosis.js';
import { registerDiagramAnalysisTool } from './tools/diagram-analysis.js';
import { registerDataVizAnalysisTool } from './tools/data-viz.js';
import { registerUiDiffCheckTool } from './tools/ui-diff.js';
import { registerGeneralImageAnalysisTool } from './tools/general-image.js';
import { registerVideoAnalysisTool } from './tools/video-analysis.js';
import { registerGenerateImageTool } from './tools/generate-image.js';

export const PAGEBUILDER_MCP_TOOL_NAMES = [
    'ui_to_artifact',
    'extract_text_from_screenshot',
    'diagnose_error_screenshot',
    'understand_technical_diagram',
    'analyze_data_visualization',
    'ui_diff_check',
    'analyze_image',
    'analyze_video',
    'generate_image'
];

const TOOL_REGISTRATIONS = [
    registerUiToArtifactTool,
    registerTextExtractionTool,
    registerErrorDiagnosisTool,
    registerDiagramAnalysisTool,
    registerDataVizAnalysisTool,
    registerUiDiffCheckTool,
    registerGeneralImageAnalysisTool,
    registerVideoAnalysisTool,
    registerGenerateImageTool
];

export function createMcpServerInstance() {
    return new McpServer({
        name: configurationService.getServerConfig().name,
        version: configurationService.getServerConfig().version
    }, {
        capabilities: {
            tools: {}
        }
    });
}

export async function registerPageBuilderMcpTools(server) {
    try {
        for (const registerTool of TOOL_REGISTRATIONS) {
            registerTool(server);
        }
        console.info('Successfully registered all tools');
    }
    catch (error) {
        const standardError = await handleError(error, {
            operation: 'tool-registration',
            metadata: { component: 'PageBuilderMcpServer' }
        });
        console.error('Failed to register tools', standardError);
        throw standardError;
    }
}

export async function createPageBuilderMcpServer() {
    const server = createMcpServerInstance();
    await registerPageBuilderMcpTools(server);
    return server;
}
