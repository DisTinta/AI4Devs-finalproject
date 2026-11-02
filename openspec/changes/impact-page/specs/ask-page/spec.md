## ADDED Requirements

### Requirement: Link to the impact screen

After its main landmark, Screen 2 SHALL hold a navigation landmark named «Navegación del proyecto» with
one link, «Analizar el impacto de un cambio», that leads to `/p/{projectId}/impact` for the project of the
path (`impact-page`). The link SHALL be outside the main landmark and after every other tab stop of Screen
2, so the banner, the main landmark and the tab order that the other requirements of Screen 2 describe are
unchanged; following it SHALL abort a pending question, as leaving the page does ("Pending question").

#### Scenario: Screen 2 links to the impact screen of its project

- **GIVEN** the routes of the web client mounted in a memory router at
  `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc`, and `fetch` replaced by a double that records every request
  and never answers
- **WHEN** the person activates the link «Analizar el impacto de un cambio» with a pointer
- **THEN** before the click the link is inside a navigation landmark named «Navegación del proyecto» that
  comes after the main landmark and is not inside it, and its target is
  `/p/a794456d-6d1b-5b55-a360-13fec83dc7bc/impact`; after it the field «Cambio» of Screen 3 is shown, the
  level-1 heading is still «acme-shop», and the double recorded no request
