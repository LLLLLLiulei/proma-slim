export interface PageBuilderInlineTextTargetDescriptor {
  version: 1
  tagName: string
  childPath: number[]
}

export interface PageBuilderInlineTextSavePayload {
  selector: string
  textTargetDescriptor: PageBuilderInlineTextTargetDescriptor
  nextText: string
}

export interface PageBuilderInlineTextSaveRequest extends PageBuilderInlineTextSavePayload {
  requestId: string
  previousText: string
}

export interface PageBuilderInlineTextSaveResult {
  requestId: string
  ok: boolean
  error?: string
}
