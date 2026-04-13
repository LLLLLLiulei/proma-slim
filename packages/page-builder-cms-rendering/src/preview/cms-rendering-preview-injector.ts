import { detectCmsRenderingUsage } from './detect-cms-rendering-usage'

export const CMS_RENDERING_PREVIEW_IMPORTMAP_ATTR = 'data-proma-cms-rendering-importmap'
export const CMS_RENDERING_PREVIEW_CONFIG_ATTR = 'data-proma-cms-rendering-config'
export const CMS_RENDERING_PREVIEW_LOADER_ATTR = 'data-proma-cms-rendering-loader'
export const CMS_RENDERING_PREVIEW_GLOBAL = '__PROMA_CMS_RENDERING_PREVIEW__'

export interface InjectCmsRenderingPreviewOptions {
  workspaceId: string
  cmsProxyBase: string
  vueAssetUrl: string
  bootstrapAssetUrl: string
}

export function injectCmsRenderingPreview(
  html: string,
  options: InjectCmsRenderingPreviewOptions,
): string {
  if (html.includes(CMS_RENDERING_PREVIEW_LOADER_ATTR)) {
    return html
  }

  const usage = detectCmsRenderingUsage(html)
  if (!usage.hasCmsRendering) {
    return html
  }

  const payload = buildPreviewInjectionPayload(options)

  if (html.includes('</body>')) {
    return html.replace('</body>', `${payload}</body>`)
  }

  if (html.includes('</head>')) {
    return html.replace('</head>', `${payload}</head>`)
  }

  return `${html}${payload}`
}

function buildPreviewInjectionPayload(options: InjectCmsRenderingPreviewOptions): string {
  const importMap = JSON.stringify({
    imports: {
      vue: options.vueAssetUrl,
    },
  })

  const configJson = JSON.stringify({
    workspaceId: options.workspaceId,
    cmsProxyBase: options.cmsProxyBase,
    vueAssetUrl: options.vueAssetUrl,
    bootstrapAssetUrl: options.bootstrapAssetUrl,
    hasCmsRendering: true,
  }).replace(/</g, '\\u003c')

  return [
    `<script type="importmap" ${CMS_RENDERING_PREVIEW_IMPORTMAP_ATTR}="true">${importMap}</script>`,
    `<script ${CMS_RENDERING_PREVIEW_CONFIG_ATTR}="true">window.${CMS_RENDERING_PREVIEW_GLOBAL} = ${configJson};</script>`,
    `<script type="module" src="${options.bootstrapAssetUrl}" ${CMS_RENDERING_PREVIEW_LOADER_ATTR}="true"></script>`,
  ].join('')
}
