import { ApiError } from '../types/index.js';

const PLATFORM_ALIASES = {
    Z_AI: 'ZAI',
    ZAI: 'ZAI',
    Z: 'ZAI',
    ZHIPU_AI: 'ZHIPU',
    ZHIPUAI: 'ZHIPU',
    ZHIPU: 'ZHIPU',
    BIGMODEL: 'ZHIPU',
    ALIYUN: 'ALIYUN',
    QWEN: 'ALIYUN',
    DASHSCOPE: 'ALIYUN'
};
const ALIYUN_PUBLIC_OPENAI_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const ALIYUN_PUBLIC_DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';
const ALIYUN_IMAGE_GENERATION_PATH = 'services/aigc/multimodal-generation/generation';

function normalizePlatformMode(mode) {
    if (!mode) {
        return 'ZHIPU';
    }
    const normalized = mode.trim().toUpperCase();
    return PLATFORM_ALIASES[normalized] || normalized;
}

function trimTrailingSlash(value) {
    return value.replace(/\/+$/, '');
}

function joinUrl(baseUrl, path) {
    return `${trimTrailingSlash(baseUrl)}/${path.replace(/^\/+/, '')}`;
}

function parseBoolean(value, defaultValue) {
    if (value == null || value === '') {
        return defaultValue;
    }
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
        return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
        return false;
    }
    return defaultValue;
}

function parseOptionalInteger(value) {
    if (value == null || value === '') {
        return undefined;
    }
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePort(value, defaultValue) {
    const parsed = parseOptionalInteger(value);
    if (!parsed || parsed < 1 || parsed > 65535) {
        return defaultValue;
    }
    return parsed;
}

function normalizeHttpPath(value) {
    if (!value || value.trim() === '') {
        return '/mcp';
    }
    const trimmed = value.trim();
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function hasPlaceholderValue(value) {
    return !value || value.toLowerCase().includes('api') || value.toLowerCase().includes('key');
}

function resolveAliyunApiKey(envConfig) {
    return envConfig.ALIYUN_API_KEY || envConfig.QWEN_API_KEY || envConfig.DASHSCOPE_API_KEY;
}

function resolveAliyunRegionalBase(envConfig) {
    const workspaceId = envConfig.ALIYUN_WORKSPACE_ID;
    if (!workspaceId) {
        return undefined;
    }
    const region = envConfig.ALIYUN_REGION || 'cn-beijing';
    if (region === 'us-east-1' || region === 'us' || region === 'dashscope-us') {
        return 'https://dashscope-us.aliyuncs.com';
    }
    return `https://${workspaceId}.${region}.maas.aliyuncs.com`;
}

function withCompatibleMode(baseUrl) {
    const base = trimTrailingSlash(baseUrl);
    return base.endsWith('/compatible-mode/v1') ? base : joinUrl(base, 'compatible-mode/v1');
}

function withApiV1(baseUrl) {
    const base = trimTrailingSlash(baseUrl);
    return base.endsWith('/api/v1') ? base : joinUrl(base, 'api/v1');
}

function resolveAliyunOpenAIBaseUrl(envConfig) {
    if (envConfig.ALIYUN_OPENAI_BASE_URL) {
        return trimTrailingSlash(envConfig.ALIYUN_OPENAI_BASE_URL);
    }
    if (envConfig.ALIYUN_BASE_URL) {
        return withCompatibleMode(envConfig.ALIYUN_BASE_URL);
    }
    const regionalBase = resolveAliyunRegionalBase(envConfig);
    return regionalBase ? withCompatibleMode(regionalBase) : ALIYUN_PUBLIC_OPENAI_BASE_URL;
}

function resolveAliyunDashScopeBaseUrl(envConfig) {
    if (envConfig.ALIYUN_DASHSCOPE_BASE_URL) {
        return withApiV1(envConfig.ALIYUN_DASHSCOPE_BASE_URL);
    }
    if (envConfig.ALIYUN_NATIVE_BASE_URL) {
        return withApiV1(envConfig.ALIYUN_NATIVE_BASE_URL);
    }
    if (envConfig.ALIYUN_BASE_URL) {
        return withApiV1(envConfig.ALIYUN_BASE_URL);
    }
    const regionalBase = resolveAliyunRegionalBase(envConfig);
    return regionalBase ? withApiV1(regionalBase) : ALIYUN_PUBLIC_DASHSCOPE_BASE_URL;
}
/**
 * Environment configuration service using singleton pattern
 */
export class EnvironmentService {
    static instance;
    config = null;
    constructor() { }
    /**
     * Get singleton instance of EnvironmentService
     */
    static getInstance() {
        if (!EnvironmentService.instance) {
            EnvironmentService.instance = new EnvironmentService();
        }
        return EnvironmentService.instance;
    }
    /**
     * Get environment configuration
     */
    getConfig() {
        if (!this.config) {
            this.config = this.loadEnvironmentConfig();
        }
        return this.config;
    }
    /**
     * Load environment configuration from process.env
     */
    loadEnvironmentConfig() {
        const envConfig = { ...process.env };
        if (!envConfig.Z_AI_BASE_URL) {
            // for z.ai paas is https://api.z.ai/api/paas/v4/
            // for zhipuai is https://open.bigmodel.cn/api/paas/v4/
            envConfig.Z_AI_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4/';
        }
        // Support both PLATFORM_MODE and Z_AI_MODE for backward compatibility
        // Priority: PLATFORM_MODE > Z_AI_MODE > default(ZHIPU)
        const platformMode = normalizePlatformMode(envConfig.PLATFORM_MODE || envConfig.Z_AI_MODE);
        envConfig.PLATFORM_MODE = platformMode;
        console.info('Running in mode', { mode: platformMode });
        if (platformMode !== 'ALIYUN') {
            if (platformMode === 'ZAI') {
                envConfig.Z_AI_BASE_URL = 'https://api.z.ai/api/paas/v4/';
            }
            else if (platformMode === 'ZHIPU') {
                envConfig.Z_AI_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4/';
            }
            if (!envConfig.Z_AI_API_KEY && envConfig.ZAI_API_KEY) {
                envConfig.Z_AI_API_KEY = envConfig.ZAI_API_KEY;
                console.warn("[important] Z_AI_API_KEY is not set but found ZAI_API_KEY, using ZAI_API_KEY as Z_AI_API_KEY");
            }
            // for some user forget replace the `your_api_key` `your_zhipu_api_key` `your_zai_api_key` in the env
            if (hasPlaceholderValue(envConfig.Z_AI_API_KEY)) {
                if (envConfig.ANTHROPIC_AUTH_TOKEN && !envConfig.ANTHROPIC_AUTH_TOKEN?.toLowerCase().includes('api')) {
                    // use the ANTHROPIC_AUTH_TOKEN as Z_AI_API_KEY if available
                    envConfig.Z_AI_API_KEY = envConfig.ANTHROPIC_AUTH_TOKEN;
                    console.warn('[important] Z_AI_API_KEY is not set but found ANTHROPIC_AUTH_TOKEN, using ANTHROPIC_AUTH_TOKEN as Z_AI_API_KEY');
                }
                else {
                    throw new ApiError('Z_AI_API_KEY environment variable is required, please set your actual API key');
                }
            }
            envConfig.API_KEY = envConfig.Z_AI_API_KEY;
        }
        else {
            const aliyunApiKey = resolveAliyunApiKey(envConfig);
            if (hasPlaceholderValue(aliyunApiKey)) {
                throw new ApiError('ALIYUN_API_KEY, QWEN_API_KEY, or DASHSCOPE_API_KEY environment variable is required for ALIYUN mode');
            }
            envConfig.API_KEY = aliyunApiKey;
            envConfig.ALIYUN_OPENAI_BASE_URL = resolveAliyunOpenAIBaseUrl(envConfig);
            envConfig.ALIYUN_DASHSCOPE_BASE_URL = resolveAliyunDashScopeBaseUrl(envConfig);
        }
        return {
            API_KEY: envConfig.API_KEY,
            Z_AI_BASE_URL: envConfig.Z_AI_BASE_URL,
            Z_AI_API_KEY: envConfig.Z_AI_API_KEY,
            Z_AI_VISION_MODEL: envConfig.Z_AI_VISION_MODEL,
            Z_AI_VISION_MODEL_TEMPERATURE: envConfig.Z_AI_VISION_MODEL_TEMPERATURE,
            Z_AI_VISION_MODEL_TOP_P: envConfig.Z_AI_VISION_MODEL_TOP_P,
            Z_AI_VISION_MODEL_MAX_TOKENS: envConfig.Z_AI_VISION_MODEL_MAX_TOKENS,
            Z_AI_IMAGE_MODEL: envConfig.Z_AI_IMAGE_MODEL,
            Z_AI_IMAGE_SIZE: envConfig.Z_AI_IMAGE_SIZE,
            Z_AI_TIMEOUT: envConfig.Z_AI_TIMEOUT,
            Z_AI_RETRY_COUNT: envConfig.Z_AI_RETRY_COUNT,
            ALIYUN_OPENAI_BASE_URL: envConfig.ALIYUN_OPENAI_BASE_URL,
            ALIYUN_DASHSCOPE_BASE_URL: envConfig.ALIYUN_DASHSCOPE_BASE_URL,
            ALIYUN_VISION_MODEL: envConfig.ALIYUN_VISION_MODEL,
            ALIYUN_VISION_MODEL_TEMPERATURE: envConfig.ALIYUN_VISION_MODEL_TEMPERATURE,
            ALIYUN_VISION_MODEL_TOP_P: envConfig.ALIYUN_VISION_MODEL_TOP_P,
            ALIYUN_VISION_MODEL_MAX_TOKENS: envConfig.ALIYUN_VISION_MODEL_MAX_TOKENS,
            ALIYUN_IMAGE_MODEL: envConfig.ALIYUN_IMAGE_MODEL,
            ALIYUN_IMAGE_SIZE: envConfig.ALIYUN_IMAGE_SIZE,
            ALIYUN_IMAGE_PROMPT_EXTEND: envConfig.ALIYUN_IMAGE_PROMPT_EXTEND,
            ALIYUN_IMAGE_WATERMARK: envConfig.ALIYUN_IMAGE_WATERMARK,
            ALIYUN_IMAGE_NEGATIVE_PROMPT: envConfig.ALIYUN_IMAGE_NEGATIVE_PROMPT,
            ALIYUN_ENABLE_THINKING: envConfig.ALIYUN_ENABLE_THINKING,
            ALIYUN_THINKING_BUDGET: envConfig.ALIYUN_THINKING_BUDGET,
            ALIYUN_VL_HIGH_RESOLUTION_IMAGES: envConfig.ALIYUN_VL_HIGH_RESOLUTION_IMAGES,
            ALIYUN_MAX_PIXELS: envConfig.ALIYUN_MAX_PIXELS,
            ALIYUN_TIMEOUT: envConfig.ALIYUN_TIMEOUT,
            ALIYUN_RETRY_COUNT: envConfig.ALIYUN_RETRY_COUNT,
            PAGEBUILDER_MCP_HOST: envConfig.PAGEBUILDER_MCP_HOST,
            PAGEBUILDER_MCP_PORT: envConfig.PAGEBUILDER_MCP_PORT,
            PAGEBUILDER_MCP_PATH: envConfig.PAGEBUILDER_MCP_PATH,
            PAGEBUILDER_MCP_LOG_PATH: envConfig.PAGEBUILDER_MCP_LOG_PATH,
            SERVER_NAME: envConfig.SERVER_NAME,
            SERVER_VERSION: envConfig.SERVER_VERSION,
            PLATFORM_MODE: envConfig.PLATFORM_MODE
        };
    }
    /**
     * Get server configuration
     */
    getServerConfig() {
        return {
            name: process.env.SERVER_NAME || 'pagebuilder-mcp-server',
            version: process.env.SERVER_VERSION || '0.1.0'
        };
    }
    /**
     * Get HTTP transport configuration
     */
    getHttpConfig() {
        return {
            host: process.env.PAGEBUILDER_MCP_HOST || '0.0.0.0',
            port: parsePort(process.env.PAGEBUILDER_MCP_PORT, 3000),
            path: normalizeHttpPath(process.env.PAGEBUILDER_MCP_PATH),
            logPath: process.env.PAGEBUILDER_MCP_LOG_PATH || undefined
        };
    }
    /**
     * Get platform mode
     */
    getPlatformMode() {
        const config = this.getConfig();
        return config.PLATFORM_MODE || 'ZHIPU';
    }
    /**
     * Get API configuration
     */
    getVisionConfig() {
        const config = this.getConfig();
        if (config.PLATFORM_MODE === 'ALIYUN') {
            const extraBody = {};
            const enableThinking = parseBoolean(config.ALIYUN_ENABLE_THINKING, undefined);
            const highResolutionImages = parseBoolean(config.ALIYUN_VL_HIGH_RESOLUTION_IMAGES, undefined);
            const thinkingBudget = parseOptionalInteger(config.ALIYUN_THINKING_BUDGET);
            const maxPixels = parseOptionalInteger(config.ALIYUN_MAX_PIXELS);
            if (enableThinking !== undefined) {
                extraBody.enable_thinking = enableThinking;
            }
            if (thinkingBudget !== undefined) {
                extraBody.thinking_budget = thinkingBudget;
            }
            if (highResolutionImages !== undefined) {
                extraBody.vl_high_resolution_images = highResolutionImages;
            }
            if (maxPixels !== undefined) {
                extraBody.max_pixels = maxPixels;
            }
            return {
                provider: 'ALIYUN',
                model: config.ALIYUN_VISION_MODEL || 'qwen3-vl-plus',
                timeout: parseInt(config.ALIYUN_TIMEOUT || config.Z_AI_TIMEOUT || '300000'),
                retryCount: parseInt(config.ALIYUN_RETRY_COUNT || config.Z_AI_RETRY_COUNT || '1'),
                url: joinUrl(config.ALIYUN_OPENAI_BASE_URL, 'chat/completions'),
                temperature: parseFloat(config.ALIYUN_VISION_MODEL_TEMPERATURE || config.Z_AI_VISION_MODEL_TEMPERATURE || '0.8'),
                topP: parseFloat(config.ALIYUN_VISION_MODEL_TOP_P || config.Z_AI_VISION_MODEL_TOP_P || '0.6'),
                maxTokens: parseInt(config.ALIYUN_VISION_MODEL_MAX_TOKENS || config.Z_AI_VISION_MODEL_MAX_TOKENS || '32768'),
                extraBody
            };
        }
        return {
            provider: config.PLATFORM_MODE,
            model: config.Z_AI_VISION_MODEL || 'glm-4.6v',
            timeout: parseInt(config.Z_AI_TIMEOUT || '300000'),
            retryCount: parseInt(config.Z_AI_RETRY_COUNT || '1'),
            url: config.Z_AI_BASE_URL + 'chat/completions',
            temperature: parseFloat(config.Z_AI_VISION_MODEL_TEMPERATURE || '0.8'),
            topP: parseFloat(config.Z_AI_VISION_MODEL_TOP_P || '0.6'),
            maxTokens: parseInt(config.Z_AI_VISION_MODEL_MAX_TOKENS || '32768')
        };
    }
    /**
     * Get image generation API configuration (GLM-Image)
     */
    getImageGenConfig() {
        const config = this.getConfig();
        if (config.PLATFORM_MODE === 'ALIYUN') {
            return {
                provider: 'ALIYUN',
                model: config.ALIYUN_IMAGE_MODEL || 'qwen-image-2.0-pro',
                size: config.ALIYUN_IMAGE_SIZE || '2048*2048',
                url: joinUrl(config.ALIYUN_DASHSCOPE_BASE_URL, ALIYUN_IMAGE_GENERATION_PATH),
                timeout: parseInt(config.ALIYUN_TIMEOUT || config.Z_AI_TIMEOUT || '300000'),
                promptExtend: parseBoolean(config.ALIYUN_IMAGE_PROMPT_EXTEND, true),
                watermark: parseBoolean(config.ALIYUN_IMAGE_WATERMARK, false),
                negativePrompt: config.ALIYUN_IMAGE_NEGATIVE_PROMPT
            };
        }
        return {
            provider: config.PLATFORM_MODE,
            model: config.Z_AI_IMAGE_MODEL || 'glm-image',
            size: config.Z_AI_IMAGE_SIZE || '1280x1280',
            url: config.Z_AI_BASE_URL + 'images/generations',
            timeout: parseInt(config.Z_AI_TIMEOUT || '300000')
        };
    }
    /**
     * Get ZAI API key from configuration
     */
    getApiKey() {
        return this.getConfig().API_KEY;
    }
}
/**
 * Global environment service instance
 */
export const environmentService = EnvironmentService.getInstance();
/**
 * Configuration service instance (for backward compatibility)
 */
export const configurationService = environmentService;
