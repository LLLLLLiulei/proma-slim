import * as React from 'react'
import { useAtom } from 'jotai'
import { Send } from 'lucide-react'
import type { AskUserQuestion } from '@proma/shared'
import { Button } from '@/components/ui/button'
import { allPendingAskUserRequestsAtom } from '@/atoms/agent-atoms'
import { api } from '@/lib/api'

interface QuestionAnswer {
  selected: string[]
  customText: string
  showCustom: boolean
}

const EMPTY_ANSWER: QuestionAnswer = { selected: [], customText: '', showCustom: false }

interface AskUserBannerProps {
  sessionId: string
}

export function AskUserBanner({ sessionId }: AskUserBannerProps): React.ReactElement | null {
  const [allRequests, setAllRequests] = useAtom(allPendingAskUserRequestsAtom)
  const requests = allRequests.get(sessionId) ?? []
  const request = requests[0] ?? null
  const [answers, setAnswers] = React.useState<Map<number, QuestionAnswer>>(new Map())
  const [activeTab, setActiveTab] = React.useState(0)
  const [submitting, setSubmitting] = React.useState(false)

  const questions = request?.questions ?? []
  const currentQuestion = questions[activeTab]
  const isLastTab = activeTab >= questions.length - 1
  const shouldRenderMeta = requests.length > 1 || questions.length > 1

  React.useEffect(() => {
    if (!request) return

    const firstOption = request.questions[0]?.options[0]
    setActiveTab(0)
    setAnswers(firstOption
      ? new Map([[0, { ...EMPTY_ANSWER, selected: [firstOption.label] }]])
      : new Map())
  }, [request?.requestId])

  if (!request || !currentQuestion) return null

  const getAnswer = (index: number): QuestionAnswer => answers.get(index) ?? EMPTY_ANSWER

  const toggleOption = (questionIndex: number, question: AskUserQuestion, label: string): void => {
    setAnswers((prev) => {
      const map = new Map(prev)
      const current = map.get(questionIndex) ?? EMPTY_ANSWER
      const selected = question.multiSelect
        ? (current.selected.includes(label)
            ? current.selected.filter((item) => item !== label)
            : [...current.selected, label])
        : [label]
      map.set(questionIndex, { ...current, selected, showCustom: false, customText: '' })
      return map
    })
  }

  const toggleCustom = (questionIndex: number): void => {
    setAnswers((prev) => {
      const map = new Map(prev)
      const current = map.get(questionIndex) ?? EMPTY_ANSWER
      map.set(questionIndex, {
        ...current,
        showCustom: !current.showCustom,
        selected: current.showCustom ? current.selected : [],
      })
      return map
    })
  }

  const handleSubmit = async (): Promise<void> => {
    if (submitting) return
    setSubmitting(true)

    try {
      const payload: Record<string, string> = {}
      for (let index = 0; index < questions.length; index++) {
        const answer = getAnswer(index)
        if (answer.showCustom && answer.customText.trim()) {
          payload[String(index)] = answer.customText.trim()
        } else if (answer.selected.length > 0) {
          payload[String(index)] = answer.selected.join(', ')
        }
      }

      await api.respondAskUser(sessionId, {
        requestId: request.requestId,
        answers: payload,
      })

      setAllRequests((prev) => {
        const map = new Map(prev)
        const current = map.get(sessionId) ?? []
        const next = current.filter((item) => item.requestId !== request.requestId)
        if (next.length === 0) {
          map.delete(sessionId)
        } else {
          map.set(sessionId, next)
        }
        return map
      })
    } catch (error) {
      console.error('[AskUserBanner] 提交回答失败:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const hasValidAnswers = questions.some((_, index) => {
    const answer = getAnswer(index)
    return answer.selected.length > 0 || (answer.showCustom && answer.customText.trim().length > 0)
  })

  return (
    <div
      data-testid="ask-user-banner"
      className="mx-4 mb-3 flex max-h-[min(32rem,calc(100vh-12rem))] min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm"
    >
      {shouldRenderMeta && (
        <div className="shrink-0 px-4 py-3">
          {requests.length > 1 && (
            <div className="flex items-center justify-end">
              <span className="text-xs text-muted-foreground">(+{requests.length - 1})</span>
            </div>
          )}

          {questions.length > 1 && (
            <div className={requests.length > 1 ? 'mt-3 flex flex-wrap gap-2' : 'flex flex-wrap gap-2'}>
              {questions.map((question, index) => {
                const answer = getAnswer(index)
                const answered = answer.selected.length > 0 || (answer.showCustom && answer.customText.trim())
                return (
                  <button
                    key={`${request.requestId}-${index}`}
                    type="button"
                    onClick={() => setActiveTab(index)}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      index === activeTab
                        ? 'bg-primary text-primary-foreground'
                        : answered
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {question.header || `问题 ${index + 1}`}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div
        data-testid="ask-user-scroll-region"
        className={`min-h-0 flex-1 overflow-y-auto px-4 pb-3 ${shouldRenderMeta ? '' : 'pt-3'}`}
      >
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium text-foreground">{currentQuestion.question}</div>
          </div>

          <div className="space-y-2">
            {currentQuestion.options.map((option) => {
              const current = getAnswer(activeTab)
              const selected = current.selected.includes(option.label)
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => toggleOption(activeTab, currentQuestion, option.label)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                    selected
                      ? 'border-primary/30 bg-primary/10'
                      : 'border-border/70 bg-background hover:bg-muted/60'
                  }`}
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  {option.description && <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>}
                </button>
              )
            })}

            <button
              type="button"
              onClick={() => toggleCustom(activeTab)}
              className={`w-full rounded-2xl border px-3 py-3 text-left text-sm transition-colors ${
                getAnswer(activeTab).showCustom
                  ? 'border-primary/30 bg-primary/10'
                  : 'border-border/70 bg-background hover:bg-muted/60'
              }`}
            >
              自定义回答
            </button>

            {getAnswer(activeTab).showCustom && (
              <textarea
                value={getAnswer(activeTab).customText}
                onChange={(event) => {
                  const value = event.target.value
                  setAnswers((prev) => {
                    const map = new Map(prev)
                    const current = map.get(activeTab) ?? EMPTY_ANSWER
                    map.set(activeTab, { ...current, customText: value })
                    return map
                  })
                }}
                rows={4}
                className="w-full rounded-2xl border border-border/70 bg-background px-3 py-3 text-sm outline-none transition-colors focus:border-primary"
                placeholder="输入你的回答..."
              />
            )}
          </div>
        </div>
      </div>

      <div
        data-testid="ask-user-footer"
        className="flex shrink-0 items-center justify-between border-t border-border/60 px-4 py-3"
      >
        <button
          type="button"
          onClick={() => setActiveTab((prev) => Math.max(0, prev - 1))}
          disabled={activeTab === 0}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          上一个
        </button>

        {isLastTab ? (
          <Button size="sm" disabled={submitting || !hasValidAnswers} onClick={() => { void handleSubmit() }}>
            <Send className="mr-1 size-3" />
            确认
          </Button>
        ) : (
          <Button size="sm" onClick={() => setActiveTab((prev) => Math.min(questions.length - 1, prev + 1))}>
            下一个
          </Button>
        )}
      </div>
    </div>
  )
}
