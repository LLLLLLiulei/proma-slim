import { ApiError } from '../types/index.js';
import { configurationService } from './environment.js';
import { EnvironmentService } from './environment.js';
/**
 * Image generation service - generates images from text prompts via GLM-Image API.
 * Symmetric counterpart to ChatService but for the reverse data flow (text -> image).
 */
export class ImageGenerationService {
    environmentService;
    /** glm-image input limit, per docs */
    MAX_PROMPT_LENGTH = 1000;
    /** Max total pixels allowed by glm-image (2^22, per docs) */
    MAX_PIXELS = 2 ** 22;
    constructor(environmentService = EnvironmentService.getInstance()) {
        this.environmentService = environmentService;
    }
    /**
     * Validate the text prompt.
     *
     * Decision on length: glm-image caps input at 1000 characters. Rather than
     * silently truncating (which would change prompt semantics without the
     * caller knowing), we reject with a clear message. The tool schema also
     * enforces this via zod .max(1000) for a friendlier UX at the boundary;
     * this is a defensive fallback for direct callers of the service.
     */
    validatePrompt(prompt) {
        if (!prompt || prompt.trim().length === 0) {
            throw new ApiError('Prompt is required for image generation');
        }
        if (prompt.length > this.MAX_PROMPT_LENGTH) {
            throw new ApiError(`Prompt exceeds ${this.MAX_PROMPT_LENGTH} characters (got ${prompt.length}). Please shorten the prompt.`);
        }
    }
    /**
     * Validate image size against GLM-Image constraints (per docs):
     *   - format: 'WxH'
     *   - HARD: width and height must both be multiples of 32  (docs: "需为32的整数倍")
     *   - HARD: total pixels (w*h) must not exceed 2^22=4194304 (docs: "保证最大像素数不超过2^22")
     *   - SOFT: each side recommended within 1024-2048         (docs: "推荐")
     *           Official enum values like 960x1728 dip below 1024, so this is
     *           a warning rather than a rejection.
     */
    validateSize(size) {
        const match = /^(\d+)x(\d+)$/.exec(size);
        if (!match) {
            throw new ApiError(`Invalid size format: '${size}'. Expected 'WxH' (e.g. '1280x1280').`);
        }
        const w = parseInt(match[1], 10);
        const h = parseInt(match[2], 10);
        if (w % 32 !== 0 || h % 32 !== 0) {
            throw new ApiError(`Invalid size '${size}': width and height must both be multiples of 32.`);
        }
        if (w * h > this.MAX_PIXELS) {
            throw new ApiError(`Invalid size '${size}': total pixels ${w * h} exceed maximum ${this.MAX_PIXELS} (2^22).`);
        }
        if (w < 1024 || w > 2048 || h < 1024 || h > 2048) {
            console.warn(`Size '${size}' is outside the recommended 1024-2048 range; proceeding anyway.`);
        }
    }
    /**
     * Validate Qwen Image 2.0 size. DashScope expects 'width*height'.
     */
    validateAliyunSize(size) {
        const match = /^(\d+)\*(\d+)$/.exec(size);
        if (!match) {
            throw new ApiError(`Invalid Aliyun image size format: '${size}'. Expected 'WxH' with '*', e.g. '2048*2048'.`);
        }
        const w = parseInt(match[1], 10);
        const h = parseInt(match[2], 10);
        if (w < 512 || w > 2048 || h < 512 || h > 2048) {
            throw new ApiError(`Invalid Aliyun image size '${size}': width and height must each be between 512 and 2048.`);
        }
    }
    /**
     * Generate an image from a text prompt
     * @param prompt Text description of the desired image
     * @param size Image size, e.g. '1280x1280'. Falls back to config default.
     * @returns Generated image URL (temporary, valid ~30 days per ZAI docs)
     */
    async generateImage(prompt, size) {
        this.validatePrompt(prompt);
        const imageConfig = configurationService.getImageGenConfig();
        const effectiveSize = size || imageConfig.size;
        if (imageConfig.provider === 'ALIYUN') {
            return await this.generateAliyunImage(prompt, effectiveSize, imageConfig);
        }
        this.validateSize(effectiveSize);
        const requestBody = {
            model: imageConfig.model,
            prompt,
            size: effectiveSize
        };
        console.info('Request ZAI image generation API', {
            model: requestBody.model,
            size: requestBody.size
        });
        const response = await this.callImageApi(imageConfig.url, requestBody);
        const imageUrl = response.data?.[0]?.url;
        if (!imageUrl) {
            throw new ApiError('Invalid API response: missing image url in response data');
        }
        console.info('Image generation API request successful');
        return imageUrl;
    }
    /**
     * Generate an image via Aliyun Qwen Image native DashScope endpoint.
     */
    async generateAliyunImage(prompt, size, imageConfig) {
        this.validateAliyunSize(size);
        const parameters = {
            size,
            prompt_extend: imageConfig.promptExtend,
            watermark: imageConfig.watermark
        };
        if (imageConfig.negativePrompt) {
            parameters.negative_prompt = imageConfig.negativePrompt;
        }
        const requestBody = {
            model: imageConfig.model,
            input: {
                messages: [
                    {
                        role: 'user',
                        content: [{ text: prompt }]
                    }
                ]
            },
            parameters
        };
        console.info('Request Aliyun Qwen Image generation API', {
            model: requestBody.model,
            size: requestBody.parameters.size
        });
        const response = await this.callImageApi(imageConfig.url, requestBody);
        const imageUrl = response.output?.choices
            ?.flatMap(choice => choice.message?.content || [])
            ?.find(item => item.image)?.image;
        if (!imageUrl) {
            throw new ApiError('Invalid Aliyun image generation response: missing image url in output choices');
        }
        console.info('Aliyun image generation API request successful');
        return imageUrl;
    }
    /**
     * Make HTTP request to the image generation API.
     * NOTE: this mirrors ChatService.chatCompletions' transport pattern (fetch +
     * AbortController + Bearer auth + error wrapping). The two could share a
     * common httpClient if a third HTTP-based tool is added.
     */
    async callImageApi(url, body) {
        const apiConfig = configurationService.getImageGenConfig();
        const apiKey = this.environmentService.getApiKey();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), apiConfig.timeout);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'Accept-Language': 'en-US,en'
                },
                body: JSON.stringify(body),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const errorText = await response.text();
                throw new ApiError(`HTTP ${response.status}: ${errorText}`);
            }
            return await response.json();
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof ApiError) {
                throw error;
            }
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new ApiError(`Request timeout after ${apiConfig.timeout}ms when calling ${url}`);
                }
                if (error.message.includes('fetch failed')) {
                    const causeInfo = error.cause ? ` | Cause: ${error.cause}` : '';
                    throw new ApiError(`Network error: Failed to connect to ${url}. ` +
                        `Original error: ${error.message}${causeInfo}`);
                }
                throw new ApiError(`Network error: ${error.message}`);
            }
            throw new ApiError(`Network error: ${String(error)}`);
        }
    }
}
/**
 * Image generation service instance
 */
export const imageGenerationService = new ImageGenerationService();
