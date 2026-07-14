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
export function registerGenerateImageTool(server, options = {}) {
    const imageConfig = configurationService.getImageGenConfig();
    const isAliyun = imageConfig.provider === 'ALIYUN';
    const toolDescription = isAliyun
        ? `Generate an image from a text prompt using the qwen-image-2.0-pro model (text-to-image).

Use this tool ONLY when the user wants to:
- Create a visual asset from a text description
- Generate text-free backgrounds, banner images, illustrations, scene art, or visual materials

Do NOT use for: analyzing/understanding existing images (use analyze_image instead), any image-to-text task, or rendering readable words inside the generated image.
Do not ask the image model to draw readable words, pseudo-words, titles, slogans, logo lettering, signboard labels, or UI copy. Render page text with HTML/CSS instead. Provider-added AI watermark text may be ignored.

Returns a temporary image URL valid for about 24 hours.`
        : `Generate an image from a text prompt using the GLM-Image model (text-to-image).

Use this tool ONLY when the user wants to:
- Create a visual asset from a text description
- Generate text-free backgrounds, banner images, illustrations, scene art, or visual materials

Do NOT use for: analyzing/understanding existing images (use analyze_image instead), any image-to-text task, or rendering readable words inside the generated image.
Do not ask the image model to draw readable words, pseudo-words, titles, slogans, logo lettering, signboard labels, or UI copy. Render page text with HTML/CSS instead. Provider-added AI watermark text may be ignored.

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
    const generateImage = options.generateImage || ((prompt, size) => imageGenerationService.generateImage(prompt, size));
    const retryableGenerate = withRetry((prompt, size) => generateImage(prompt, size), 2, 1000);
    server.tool('generate_image', toolDescription, {
        prompt: z.string()
            .min(1, 'Prompt cannot be empty')
            .max(1000, 'Prompt must be at most 1000 characters')
            .describe('Text description of the desired image. Supports Chinese and English. Describe the subject, style, and composition. Do not request readable words, pseudo-text, titles, slogans, logo lettering, signboard labels, or UI copy inside the image; render required page text with HTML/CSS instead. Provider-added AI watermark text may be ignored.'),
        size: sizeSchema
    }, async (params) => {
        try {
            const validationSchema = new ToolSchemaBuilder()
                .required('prompt', CommonSchemas.nonEmptyString)
                .optional('size', validationSizeSchema)
                .build();
            validationSchema.parse(params);
            const imageUrl = await retryableGenerate(params.prompt, params.size);
            if (options.assetSink) {
                const asset = await options.assetSink(imageUrl, {
                    prompt: params.prompt,
                    size: params.size,
                    provider: imageConfig.provider
                });
                return formatMcpResponse(createSuccessResponse({
                    imageUrl,
                    asset,
                    note: 'Generated image was saved as a PageBuilder workspace asset. Use asset.assetPreviewPath in HTML/CSS.'
                }));
            }
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
