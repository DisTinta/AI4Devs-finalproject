## Story
As a {{role}}, I want {{capability}}, so that {{business outcome}}.

## Acceptance criteria (Given / When / Then)

Scenario: {{happy path}}
Given {{prior context}}
When  {{action}}
Then  {{observable result}}
And   {{additional effect}}

Scenario: {{edge case}}
Given ...
When  ...
Then  ...

Scenario: {{error case}}
Given ...
When  ...
Then  ...

## Technical context (for the agent)
{{Real repository paths: where it fits, which entity it touches, which validation to extend, which
previous test serves as a template. This goes last on purpose: the agent reads top to bottom and must
understand the product before the technique.}}

## Non-goals (explicit)
- {{what this story does NOT do}}
- {{what is deferred to another ticket}}

## Estimate
{{S / M / L}} — {{one-sentence justification}}
