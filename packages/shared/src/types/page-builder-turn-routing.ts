export const PAGE_BUILDER_TURN_ROUTING_TAG = 'page_builder_turn_routing'
export const PAGE_BUILDER_GUIDED_GENERATION_OWNER_SKILL = 'page-builder-guided-generation'
export const PAGE_BUILDER_CMS_BINDING_APPLY_OWNER_SKILL = 'cms-binding-apply'

export type PageBuilderTurnSceneKind =
  | 'ordinary-page-flow'
  | 'existing-cms-region-ordinary-edit'
  | 'confirmed-cms-apply'

export type PageBuilderOwnerSkill =
  | typeof PAGE_BUILDER_GUIDED_GENERATION_OWNER_SKILL
  | typeof PAGE_BUILDER_CMS_BINDING_APPLY_OWNER_SKILL

export interface PageBuilderTurnRoutingMetadata {
  sceneKind: PageBuilderTurnSceneKind
  ownerSkill: PageBuilderOwnerSkill
  ownerLockedForTurn: true
  consultSkills?: string[]
}

export function serializePageBuilderTurnRoutingMetadata(
  routing: PageBuilderTurnRoutingMetadata,
): string {
  return `<${PAGE_BUILDER_TURN_ROUTING_TAG}>${JSON.stringify(routing)}</${PAGE_BUILDER_TURN_ROUTING_TAG}>`
}

export function extractPageBuilderTurnRoutingMetadata(
  message: string,
): PageBuilderTurnRoutingMetadata | null {
  const match = message.match(
    new RegExp(
      `<${PAGE_BUILDER_TURN_ROUTING_TAG}>\\s*([\\s\\S]*?)\\s*</${PAGE_BUILDER_TURN_ROUTING_TAG}>`,
    ),
  )
  if (!match) {
    return null
  }

  try {
    const parsed = JSON.parse(match[1]!) as Partial<PageBuilderTurnRoutingMetadata>
    if (
      typeof parsed !== 'object'
      || parsed === null
      || (parsed.sceneKind !== 'ordinary-page-flow'
        && parsed.sceneKind !== 'existing-cms-region-ordinary-edit'
        && parsed.sceneKind !== 'confirmed-cms-apply')
      || (parsed.ownerSkill !== PAGE_BUILDER_GUIDED_GENERATION_OWNER_SKILL
        && parsed.ownerSkill !== PAGE_BUILDER_CMS_BINDING_APPLY_OWNER_SKILL)
      || parsed.ownerLockedForTurn !== true
    ) {
      return null
    }

    const consultSkills = Array.isArray(parsed.consultSkills)
      ? parsed.consultSkills.filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0)
      : undefined

    return {
      sceneKind: parsed.sceneKind,
      ownerSkill: parsed.ownerSkill,
      ownerLockedForTurn: true,
      ...(consultSkills && consultSkills.length > 0 ? { consultSkills } : {}),
    }
  } catch {
    return null
  }
}
