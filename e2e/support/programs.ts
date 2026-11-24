import { withSql } from './db';

/**
 * Seeds an annual program with an initial capex/opex budget.
 *
 * Program creation is a UI rule: a plan that is already active accepts only a
 * zero-budget program, and its money arrives through a budget revision
 * (ADR-0006 §4). The later-tier specs set up data for edits, voids, settlement,
 * close and reports; the revision path itself is covered by the foundation and
 * `revisions.spec.ts`. Seeding the row directly keeps those specs focused on
 * the behaviour they pin without inventing a revision for every fixture.
 */
export interface ProgramFixtureInput {
  fiscalYear: number;
  siCode: string;
  code: string;
  name: string;
  capex: number;
  opex: number;
}

/** Inserts the program and returns its id. */
export async function createProgramFixture(input: ProgramFixtureInput): Promise<string> {
  return withSql(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      insert into annual_programs (annual_plan_id, si_id, code, name, capex_budget, opex_budget)
      select ap.id, si.id, ${input.code}, ${input.name}, ${input.capex}, ${input.opex}
      from annual_plans ap
      join strategic_initiatives si on si.plan_id = ap.plan_id
      where ap.fiscal_year = ${input.fiscalYear} and si.code = ${input.siCode}
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) {
      throw new Error(
        `Could not create program ${input.code}: FY${input.fiscalYear} or ${input.siCode} not found.`,
      );
    }
    return id;
  });
}
