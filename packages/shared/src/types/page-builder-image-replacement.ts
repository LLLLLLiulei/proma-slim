export interface PageBuilderImageTargetDescriptor {
  version: 1
  tagName: string
  childPath: number[]
}

export interface PageBuilderReplaceImageCapability {
  supported: true
  targetDescriptor: PageBuilderImageTargetDescriptor
}

export interface PageBuilderImageReplacementPayload {
  selector: string
  imageTargetDescriptor: PageBuilderImageTargetDescriptor
}
