## MODIFIED Requirements

### Requirement: Indexing a repository of one's own is a hint, not a control

Below the list of projects, after a separator, Screen 1 SHALL show the text «+ Indexar mi propio
repositorio» as a paragraph, the command `npm run cli -- index <carpeta> --name <nombre> --language php`
as code, and the line «Desde la terminal · requiere Docker, Node 22+ y Git 2.45.1+ · por ahora solo
PHP». None of them SHALL be a link, a button or any other interactive control.

#### Scenario: The indexing hint is text, not a control

- **GIVEN** Screen 1 shown with `fetch` replaced by a double that never answers
- **WHEN** the main landmark is read
- **THEN** after the list «Proyectos de muestra» it shows the text «+ Indexar mi propio repositorio», the
  code `npm run cli -- index <carpeta> --name <nombre> --language php` and the line «Desde la terminal ·
  requiere Docker, Node 22+ y Git 2.45.1+ · por ahora solo PHP»; and no link and no button of the page
  has an accessible name containing «Indexar»
