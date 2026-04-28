# Guided Briefing Thresholds

## Required Items

The briefing flow is not a fixed questionnaire, but these minimum drafting inputs must be explicit before generation:

- page goal
- target audience
- major content blocks
- tone or style direction
- whether the page needs responsive behavior across desktop and mobile

If any required item is missing, ask only the highest-priority missing question first.

## Conditional Required Items

Ask about these only when they would still materially affect the result and cannot be safely defaulted:

- device priority
- must-have / must-avoid constraints
- whether the current page should be iterated or fully redone

## When To Move To Final Confirmation

Stop asking follow-up questions and move to pre-generation confirmation when:

- required items are explicit
- conditional required items are explicit or can safely use reasonable defaults

## Final Confirmation

Before generation, restate the current understanding in a short summary, then confirm it with `AskUserQuestion`.

The confirmation summary should usually include:

- page goal
- target audience
- major content blocks
- tone or style direction
- responsive requirement
- device priority
- must-have / must-avoid constraints

## "Decide For Me"

If the user explicitly says "decide for me" or expresses the same intent:

- still do not skip final confirmation
- use reasonable defaults only for non-critical details
- do not invent hard factual information for the user

## Full Overwrite Of A Non-Empty Page

If the current page already contains non-trivial content and the user wants a full redo:

- ask for full overwrite confirmation first
- do not rewrite the whole page before confirmation
