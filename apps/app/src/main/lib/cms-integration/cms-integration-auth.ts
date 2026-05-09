import type { CmsIntegrationConfig } from './cms-integration-config'
import { cmsIntegrationUnauthorized } from './cms-integration-errors'

export function assertIntegrationSecret(request: Request, config: Pick<CmsIntegrationConfig, 'integrationSecret'>): void {
  const authorization = request.headers.get('authorization')?.trim() ?? ''
  const expectedSecret = config.integrationSecret?.trim()

  if (!expectedSecret || !authorization.toLowerCase().startsWith('bearer ')) {
    throw cmsIntegrationUnauthorized()
  }

  const providedSecret = authorization.slice('bearer '.length).trim()
  if (!providedSecret || providedSecret !== expectedSecret) {
    throw cmsIntegrationUnauthorized()
  }
}
