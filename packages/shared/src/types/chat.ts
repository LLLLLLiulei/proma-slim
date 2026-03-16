/**
 * 当前 Web 运行时仅保留仍有消费者的附件类型。
 */
export interface FileAttachment {
  id: string
  filename: string
  mediaType: string
  localPath: string
  size: number
}
