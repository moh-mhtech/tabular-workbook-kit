# Agents

tabular-workbook-kit is a sheets-style workbook library that hosts embed. It is not an application.

- Glossary: [CONTEXT.md](CONTEXT.md). ADRs: [docs/adr/](docs/adr/).
- UI tests go through `renderWorkbookCanvas` from `tabular-workbook-kit/testing` (`src/react/canvasTest.tsx`).
- Browser layout checks: BudgetTool skill **ui-visual-capture** (`runUiCaptureScenario` in `src/react/uiCaptureScenarios.ts`, Playground `capture.html`).
- Chrome icons: `@mui/icons-material` via [src/react/icons.tsx](src/react/icons.tsx) (`Wk…` wrappers). Do not add inline SVG or glyph icons unless the user asks; logos and canvas drawing are exceptions. See BudgetTool `.cursor/rules/icons.mdc`.
- This library is a prototype: change the current model. Do not add snapshot migrators.
