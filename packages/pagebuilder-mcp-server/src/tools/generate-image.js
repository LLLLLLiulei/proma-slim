import { z } from 'zod';
import { ApiError } from '../types/index.js';
import { CommonSchemas, ToolSchemaBuilder } from '../utils/validation.js';
import { formatMcpResponse, createSuccessResponse, createErrorResponse, withRetry } from '../core/api-common.js';
import { imageGenerationService } from '../core/image-generation-service.js';
import { configurationService } from '../core/environment.js';
/**
 * Recommended sizes for glm-image (from docs). Used in the tool description to
 * guide the LLM; custom sizes are also allowed and validated by the service
 * against the documented constraints (multiples of 32, total pixels <= 2^22).
 */
const RECOMMENDED_SIZES = [
    '1280x1280', '1568x1056', '1056x1568',
    '1472x1088', '1088x1472', '1728x960', '960x1728'
];
const ALIYUN_RECOMMENDED_SIZES = [
    '2048*2048', '1536*2048', '2048*1536', '1024*1024'
];
/**
 * Register image generation tool with MCP server
 * @param server MCP server instance
 */
export function registerGenerateImageTool(server) {
    const imageConfig = configurationService.getImageGenConfig();
    const isAliyun = imageConfig.provider === 'ALIYUN';
    const toolDescription = isAliyun
        ? `Generate an image from a text prompt using the qwen-image-2.0-pro model (text-to-image).

Use this tool ONLY when the user wants to:
- Create an image from a text description
- Generate posters, illustrations, social media graphics, multi-panel comics
- Produce images that need accurate embedded Chinese or English text

Do NOT use for: analyzing/understanding existing images (use analyze_image instead), or any image-to-text task.

Returns a temporary image URL valid for about 24 hours.`
        : `Generate an image from a text prompt using the GLM-Image model (text-to-image).

Use this tool ONLY when the user wants to:
- Create an image from a text description
- Generate posters, illustrations, social media graphics, multi-panel comics
- Produce images that need accurate embedded text (GLM-Image is SOTA at text rendering)

Do NOT use for: analyzing/understanding existing images (use analyze_image instead), or any image-to-text task.

The model supports hd quality only (~20s per image). Prompt limit: 1000 characters.
Returns a temporary image URL valid for ~30 days.`;
    const sizeSchema = isAliyun
        ? z.string()
            .regex(/^\d+\*\d+$/, "Size must be in 'W*H' format, e.g. '2048*2048'")
            .default('2048*2048')
            .describe(`Image size (W*H). Default 2048*2048. Recommended: ${ALIYUN_RECOMMENDED_SIZES.join(', ')}. Width and height must each be between 512 and 2048.`)
        : z.string()
            .regex(/^\d+x\d+$/, "Size must be in 'WxH' format, e.g. '1280x1280'")
            .default('1280x1280')
            .describe(`Image size (WxH). Default 1280x1280 (1:1). Recommended: ${RECOMMENDED_SIZES.join(', ')}. Custom sizes allowed but width and height must each be multiples of 32, total pixels <= 4194304 (2^22); each side recommended within 1024-2048.`);
    const validationSizeSchema = isAliyun
        ? z.string().regex(/^\d+\*\d+$/, "Size must be in 'W*H' format")
        : z.string().regex(/^\d+x\d+$/, "Size must be in 'WxH' format");
    const retryableGenerate = withRetry((prompt, size) => imageGenerationService.generateImage(prompt, size), 2, 1000);
    server.tool('generate_image', toolDescription, {
        prompt: z.string()
            .min(1, 'Prompt cannot be empty')
            .max(1000, 'Prompt must be at most 1000 characters')
            .describe('Text description of the desired image. Supports Chinese and English. Describe the subject, style, composition, and any text to render.'),
        size: sizeSchema
    }, async (params) => {
        try {
            const validationSchema = new ToolSchemaBuilder()
                .required('prompt', CommonSchemas.nonEmptyString)
                .optional('size', validationSizeSchema)
                .build();
            validationSchema.parse(params);
            const imageUrl = await retryableGenerate(params.prompt, params.size);
            const message = isAliyun
                ? `Image URL: ${imageUrl}\n\nNote: This is a temporary URL valid for about 24 hours.`
                : `Image generated successfully.\n\nImage URL: ${imageUrl}\n\nNote: This is a temporary URL valid for ~30 days. Please download and save the image if you need it long-term.`;
            return formatMcpResponse(createSuccessResponse(message));
        }
        catch (error) {
            console.error('Generate image tool execution failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            let errorResponse;
            if (error instanceof z.ZodError) {
                const validationErrors = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
                errorResponse = createErrorResponse(`Validation failed: ${validationErrors}`);
            }
            else if (error instanceof ApiError) {
                errorResponse = createErrorResponse(`API error: ${error.message}`);
            }
            else {
                errorResponse = createErrorResponse(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
            }
            return formatMcpResponse(errorResponse);
        }
    });
    console.info('Generate Image tool registered successfully');
}
