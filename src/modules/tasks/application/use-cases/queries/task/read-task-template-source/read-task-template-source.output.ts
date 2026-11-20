/** The source content permitted in a template, or the task owner's stable refusal. */
export type ReadTaskTemplateSourceOutput =
  | {
      readonly outcome: 'found';
      readonly source: {
        readonly listId: string;
        readonly title: string;
        readonly description: string | null;
        readonly priority: 'urgente' | 'haute' | 'moyenne' | 'basse';
        readonly labels: readonly string[];
        readonly checklist: readonly string[];
        readonly subtasks: readonly string[];
      };
    }
  | {
      readonly outcome: 'refused';
      readonly status: 403 | 404 | 409;
      readonly code: string;
      readonly details?: Readonly<Record<string, unknown>>;
    };
