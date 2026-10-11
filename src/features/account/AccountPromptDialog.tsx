import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { AccountAnswer, AccountQuestion } from '../../auth/signInDecision'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { ModalHeader } from '../ui/ModalHeader'

export type AccountPromptState =
  | { kind: 'question'; question: AccountQuestion }
  | { kind: 'sending' }
  | { kind: 'wipe-failed' }

export interface AccountPromptProps {
  state: AccountPromptState
  onAnswer: (answer: AccountAnswer) => void
  onRetryWipe: () => void
  onDismiss: () => void
}

type ActionVariant = 'primary' | 'danger' | 'secondary'

interface PromptAction {
  answer: AccountAnswer
  labelKey:
    | 'account.prompt.adopt.add'
    | 'account.prompt.adopt.erase'
    | 'account.prompt.replace.erase'
    | 'account.prompt.loss.signOut'
    | 'account.prompt.cancel'
  variant: ActionVariant
  /** The safe answer receives initial focus, so Enter never confirms a destructive one. */
  focused?: boolean
}

const CANCEL: PromptAction = {
  answer: 'cancel',
  labelKey: 'account.prompt.cancel',
  variant: 'secondary',
  focused: true,
}

const ACTIONS: Record<AccountQuestion['kind'], PromptAction[]> = {
  adopt: [
    { answer: 'add', labelKey: 'account.prompt.adopt.add', variant: 'primary', focused: true },
    { answer: 'erase', labelKey: 'account.prompt.adopt.erase', variant: 'danger' },
  ],
  replace: [
    { answer: 'erase', labelKey: 'account.prompt.replace.erase', variant: 'danger' },
    CANCEL,
  ],
  loss: [
    { answer: 'sign-out', labelKey: 'account.prompt.loss.signOut', variant: 'danger' },
    CANCEL,
  ],
}

export function AccountPromptDialog({
  state,
  onAnswer,
  onRetryWipe,
  onDismiss,
}: AccountPromptProps) {
  const { t } = useTranslation()
  const focusRef = useRef<HTMLButtonElement>(null)

  function questionCopy(q: AccountQuestion): { title: string; body: string } {
    switch (q.kind) {
      case 'adopt':
        return {
          title: t('account.prompt.adopt.title'),
          body: t('account.prompt.adopt.body', { count: q.count }),
        }
      case 'replace':
        return {
          title: t('account.prompt.replace.title'),
          body:
            q.pendingCount > 0
              ? t('account.prompt.replace.bodyPending', { count: q.pendingCount })
              : t('account.prompt.replace.body'),
        }
      case 'loss':
        return {
          title: t('account.prompt.loss.title'),
          body: t('account.prompt.loss.body', { count: q.pendingCount }),
        }
    }
  }

  if (state.kind === 'sending') {
    const title = t('account.prompt.sending')
    return (
      <Modal onClose={() => {}} label={title}>
        <ModalHeader title={title} onClose={() => {}} />
      </Modal>
    )
  }

  if (state.kind === 'wipe-failed') {
    const message = t('account.prompt.wipeFailed')
    return (
      <Modal onClose={onDismiss} label={message}>
        <ModalHeader title={message} onClose={onDismiss} />
        <p role="alert" className="text-sm text-gray-700">
          {message}
        </p>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={onRetryWipe}>
            {t('account.prompt.retry')}
          </Button>
        </div>
      </Modal>
    )
  }

  const { title, body } = questionCopy(state.question)
  const cancel = () => onAnswer('cancel')
  return (
    <Modal onClose={cancel} label={title} initialFocus={focusRef}>
      <ModalHeader title={title} onClose={cancel} />
      <p className="text-sm text-gray-700">{body}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {ACTIONS[state.question.kind].map((action) => (
          <Button
            key={action.answer}
            variant={action.variant}
            ref={action.focused ? focusRef : undefined}
            onClick={() => onAnswer(action.answer)}
          >
            {t(action.labelKey)}
          </Button>
        ))}
      </div>
    </Modal>
  )
}
