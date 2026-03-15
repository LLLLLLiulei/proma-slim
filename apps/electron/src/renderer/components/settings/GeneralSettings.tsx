import * as React from 'react'
import { useAtom } from 'jotai'
import { Camera, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'
import { UserAvatar } from '@/components/common/UserAvatar'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { userProfileAtom } from '@/atoms/user-profile'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { SettingsCard, SettingsRow, SettingsSection } from './primitives'

interface EmojiMartEmoji {
  native: string
}

export function GeneralSettings(): React.ReactElement {
  const [userProfile, setUserProfile] = useAtom(userProfileAtom)
  const [isEditingName, setIsEditingName] = React.useState(false)
  const [nameInput, setNameInput] = React.useState(userProfile.userName)
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let cancelled = false

    void api.getUserProfile().then((profile) => {
      if (!cancelled) {
        setUserProfile(profile)
        setNameInput(profile.userName)
      }
    }).catch((error) => {
      console.error('[GeneralSettings] 读取用户档案失败:', error)
      toast.error(error instanceof Error ? error.message : '读取用户档案失败')
    })

    return () => {
      cancelled = true
    }
  }, [setUserProfile])

  const handleAvatarChange = async (avatar: string): Promise<void> => {
    try {
      const updated = await api.updateUserProfile({ avatar })
      setUserProfile(updated)
      setShowEmojiPicker(false)
    } catch (error) {
      console.error('[GeneralSettings] 更新头像失败:', error)
      toast.error(error instanceof Error ? error.message : '更新头像失败')
    }
  }

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const result = reader.result
      if (typeof result !== 'string') return
      await handleAvatarChange(result)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const handleSaveName = async (): Promise<void> => {
    const trimmed = nameInput.trim()
    if (!trimmed) {
      setNameInput(userProfile.userName)
      setIsEditingName(false)
      return
    }

    try {
      const updated = await api.updateUserProfile({ userName: trimmed })
      setUserProfile(updated)
      setNameInput(updated.userName)
      setIsEditingName(false)
    } catch (error) {
      console.error('[GeneralSettings] 更新用户名失败:', error)
      toast.error(error instanceof Error ? error.message : '更新用户名失败')
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection title="用户档案" description="设置你的显示名称和头像。">
        <SettingsCard>
          <div className="flex items-center gap-5 px-4 py-4">
            <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
              <PopoverTrigger asChild>
                <div className="group/avatar relative cursor-pointer">
                  <UserAvatar avatar={userProfile.avatar} size={64} />
                  <div className={cn(
                    'absolute inset-0 flex items-center justify-center rounded-[20%] bg-black/40 opacity-0 transition-opacity',
                    'group-hover/avatar:opacity-100',
                  )}>
                    <Camera className="size-5 text-white" />
                  </div>
                </div>
              </PopoverTrigger>
              <PopoverContent side="right" align="start" sideOffset={12} className="w-auto border-none p-0 shadow-xl">
                <Picker
                  data={data}
                  onEmojiSelect={(emoji: EmojiMartEmoji) => { void handleAvatarChange(emoji.native) }}
                  locale="zh"
                  theme="auto"
                  previewPosition="none"
                  skinTonePosition="search"
                  perLine={8}
                />
                <div className="p-2 px-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] text-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                  >
                    <ImagePlus className="size-4" />
                    上传自定义图片
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={(event) => { void handleImageUpload(event) }}
                  />
                </div>
              </PopoverContent>
            </Popover>

            <div className="min-w-0 flex-1">
              {isEditingName ? (
                <input
                  autoFocus
                  type="text"
                  value={nameInput}
                  maxLength={30}
                  onChange={(event) => setNameInput(event.target.value)}
                  onBlur={() => { void handleSaveName() }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleSaveName()
                    }
                    if (event.key === 'Escape') {
                      setNameInput(userProfile.userName)
                      setIsEditingName(false)
                    }
                  }}
                  className="w-full max-w-[220px] border-b-2 border-primary bg-transparent pb-0.5 text-lg font-semibold text-foreground outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNameInput(userProfile.userName)
                    setIsEditingName(true)
                  }}
                  className="text-left text-lg font-semibold text-foreground transition-colors hover:text-primary"
                >
                  {userProfile.userName}
                </button>
              )}
              <p className="mt-1 text-[12px] text-foreground/45">点击头像更换，点击名字编辑。</p>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="说明" description="当前设置页只保留最常用的两个区域。">
        <SettingsCard>
          <SettingsRow
            label="最小化界面"
            description="渠道、代理、更新和工具设置已从当前版本界面中移除。"
          />
        </SettingsCard>
      </SettingsSection>
    </div>
  )
}
