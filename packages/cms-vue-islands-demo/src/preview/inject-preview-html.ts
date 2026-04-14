export function injectPreviewHtml(
  sourceHtml: string,
  options: {
    pageName: string
    cmsApiBase: string
    bootstrapAssetPath: string
  },
): string {
  const runtimeConfig = JSON.stringify({
    pageName: options.pageName,
    cmsApiBase: options.cmsApiBase,
  }).replace(/</g, '\\u003c')

  const injection = [
    `<script>window.__CMS_VUE_ISLANDS_DEMO__=${runtimeConfig};</script>`,
    `<script src="${options.bootstrapAssetPath}"></script>`,
  ].join('')

  if (sourceHtml.includes('</body>')) {
    return sourceHtml.replace('</body>', `${injection}</body>`)
  }

  return `${sourceHtml}${injection}`
}
