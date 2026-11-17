# Opening-balance import sample workbooks

These files are **fictitious** and exist only for the unit tests of the opening-balance import
foundation (W3a, `src/lib/opening-import/`). The real FY2026 workbook stays off-repo.

| File | Purpose |
| --- | --- |
| `strategic-initiatives.sample.csv` | A good strategic-initiative import file |
| `annual-programs.sample.csv` | A good annual-program import file |
| `annual-programs.owner-column.sample.csv` | Annual-program data with an owner-added `Procurement method` column (projects carries the committed demonstration column) |
| `projects.sample.csv` | A good project import file (quoted description, ijin prinsip dates) |
| `projects.sample.xlsx` | The same rows as `projects.sample.csv`, with real numeric and date cells |
| `projects.invalid.csv` | Bad values and a missing required cell, for line-level error tests |

`projects.sample.xlsx` was generated from `projects.sample.csv` with the declared field list. The
test `fixtures.test.ts` parses both files and asserts they produce identical rows, so the pair cannot
drift; if the CSV changes, regenerate the workbook (write the parsed rows back with ExcelJS, using
real `Date` cells for the `date` columns) and re-run `pnpm test`.

Generate a fresh, empty template at any time with:

```sh
pnpm opening:template projects --closing-fiscal-year 2026 --format xlsx
```
