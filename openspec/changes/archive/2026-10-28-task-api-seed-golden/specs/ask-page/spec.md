## MODIFIED Requirements

### Requirement: Suggested questions

For a project that has suggested questions, the main landmark SHALL show, after the question box, the
text «Prueba:» and a group named by that text holding one button per suggested question, in the order of
the versioned suggested-question constant, each named by its question. The suggested questions of a
sample project SHALL be exactly the questions of its golden answers file (`seeds/cache/<project>.json`),
in the file's order, so that in evaluation mode each of them is answered from the answer cache; a project
without golden answers has none, and then neither «Prueba:» nor the group is shown. Pressing a suggested
question SHALL put its text in the field and send it at once, exactly as a written question ("Question
box"); the focus SHALL stay on the pressed button.

#### Scenario: A suggested question is sent at once

- **GIVEN** Screen 2 of acme-shop, and `fetch` replaced by a double that records every request and never
  answers
- **WHEN** the person presses the button «¿Cómo se calcula el precio final de un pedido?»
- **THEN** the double recorded exactly one request, `POST /api/projects/a794456d-6d1b-5b55-a360-13fec83dc7bc/ask`
  with body exactly `{"question":"¿Cómo se calcula el precio final de un pedido?"}`; the field holds «¿Cómo
  se calcula el precio final de un pedido?»; an element with role `status` holds «Buscando evidencia…»;
  and the focus is on the pressed button

#### Scenario: The suggested questions are the golden questions

- **GIVEN** the versioned suggested-question constant, the versioned sample-project constant and every
  golden answers file `seeds/cache/*.json`
- **WHEN** the coherence test compares them
- **THEN** for every golden file, the sample project whose name is the file's `project` has as suggested
  questions exactly the `question` of the file's entries, in the file's order; every key of the
  suggested-question constant is the id of a sample project that has a golden file; the suggested
  questions of acme-shop are «¿Cómo se calcula el precio final de un pedido?», «¿Cómo se validan los
  cupones?» and «¿Qué hace OrderObserver al crear un pedido?»; and the suggested questions of task-api
  are «¿Cómo valida taskRoutes las peticiones entrantes?», «¿Qué hace buildPage con los resultados
  paginados?» and «¿Qué
  transiciones de estado son válidas?»
