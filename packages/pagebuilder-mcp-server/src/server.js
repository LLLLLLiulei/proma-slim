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

export const PAGEBUILDER_RUNTIME_MCP_TOOL_NAMES = [
    'analyze_image',
    'generate_image'
];

const TOOL_REGISTRATIONS = [
    { name: 'ui_to_artifact', register: registerUiToArtifactTool },
    { name: 'extract_text_from_screenshot', register: registerTextExtractionTool },
    { name: 'diagnose_error_screenshot', register: registerErrorDiagnosisTool },
    { name: 'understand_technical_diagram', register: registerDiagramAnalysisTool },
    { name: 'analyze_data_visualization', register: registerDataVizAnalysisTool },
    { name: 'ui_diff_check', register: registerUiDiffCheckTool },
    { name: 'analyze_image', register: registerGeneralImageAnalysisTool },
    { name: 'analyze_video', register: registerVideoAnalysisTool },
    { name: 'generate_image', register: registerGenerateImageTool }
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

export async function registerPageBuilderMcpTools(server, options = {}) {
    try {
        const requestedToolNames = options.toolNames
            ? new Set(options.toolNames)
            : null;
        for (const { name, register } of TOOL_REGISTRATIONS) {
            if (requestedToolNames && !requestedToolNames.has(name)) {
                continue;
            }
            register(server, options);
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

export async function createPageBuilderMcpServer(options = {}) {
    const server = createMcpServerInstance();
    await registerPageBuilderMcpTools(server, options);
    return server;
}
