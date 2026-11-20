import { describe, expect, it } from 'vitest';
import type { IntakeDefaultsEligibility } from '../../policies/form/intake-defaults-eligibility.policy.js';
import type { IntakeEditorContext } from '../../policies/form/intake-editor-context.policy.js';
import type { IntakePublicationContext } from '../../policies/form/intake-publication-context.policy.js';
import { IntakeForm } from './intake-form.aggregate.js';

const editor: IntakeEditorContext = { role: 'edit', lifecycle: 'active' };
const archived: IntakeEditorContext = { ...editor, lifecycle: 'archived' };
const assigneeId = 'db19d64d-3a16-45ef-9998-e0cf036137fc';
const key = 'A'.repeat(43);
const newKey = 'B'.repeat(43);
const eligibility: IntakeDefaultsEligibility = {
  allowedStatuses: new Set(['triage', 'todo', 'cancelled']),
  eligibleAssignees: new Set([assigneeId]),
};
const publication: IntakePublicationContext = { key, lifecycle: 'active', eligibility };
const invalidDefaults: IntakeDefaultsEligibility = { ...eligibility, allowedStatuses: new Set() };

function draft(): IntakeForm {
  return IntakeForm.create(eligibility);
}

function published(): IntakeForm {
  return draft().publish(editor, 1, eligibility, key);
}

describe('IntakeForm', () => {
  it('preserves text-only submissions and permits attachments on configurations saved before P4', () => {
    const form = published();
    const text = { title: 'Refondre la connexion SSO', contactEmail: 'camille@example.test' };
    const attachmentIds = ['019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01'];

    expect(form.snapshot().fields.attachments).toBeUndefined();
    expect(form.submit(publication, { ...text, attachmentIds })).toEqual(
      form.submit(publication, text),
    );
  });

  it('enforces attachment field modes and keeps the mode when another field is edited', () => {
    const form = published();
    const required = form.configure(
      editor,
      2,
      { fields: { attachments: 'required' } },
      eligibility,
    );
    const changed = required.configure(
      editor,
      3,
      { fields: { priority: 'required' } },
      eligibility,
    );
    const disabled = changed.configure(
      editor,
      4,
      { fields: { attachments: 'disabled' } },
      eligibility,
    );
    const text = {
      title: 'Refondre la connexion SSO',
      contactEmail: 'camille@example.test',
      priority: 'moyenne',
    };
    const attachmentIds = ['019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01'];

    expect(changed.publicForm(publication).fields.attachments).toBe('required');
    expect(() => changed.submit(publication, text)).toThrow(
      expect.objectContaining({
        failure: {
          kind: 'invalid-submission',
          issues: [{ field: 'attachmentIds', reason: 'required' }],
        },
      }),
    );
    expect(() => changed.submit(publication, { ...text, attachmentIds })).not.toThrow();
    expect(() => disabled.submit(publication, { ...text, attachmentIds })).toThrow(
      expect.objectContaining({
        failure: {
          kind: 'invalid-submission',
          issues: [{ field: 'attachmentIds', reason: 'disabled' }],
        },
      }),
    );
    expect(() => disabled.submit(publication, text)).not.toThrow();
  });

  it('starts as an unpublished draft with neutral text and documented defaults', () => {
    expect(draft().configuration(editor)).toEqual({
      title: 'Déposer une demande',
      description: 'Décrivez votre besoin en quelques mots.',
      fields: {
        description: 'optional',
        priority: 'optional',
        dueDate: 'optional',
        contactEmail: 'required',
      },
      defaultStatus: 'triage',
      defaultAssigneeId: null,
      publicKey: null,
      version: 1,
    });
    expect(
      IntakeForm.create({ ...eligibility, allowedStatuses: new Set(['todo']) }).snapshot()
        .defaultStatus,
    ).toBe('todo');
  });

  it('reads archived settings and distinguishes missing access from insufficient access', () => {
    const form = draft();
    expect(form.configuration(archived)).toEqual(form.snapshot());
    expect(() => form.configuration({ ...editor, lifecycle: 'removed' })).toThrow(
      expect.objectContaining({ failure: { kind: 'list-not-found' } }),
    );
    expect(() => form.configuration({ ...editor, role: null })).toThrow(
      expect.objectContaining({ failure: { kind: 'list-not-found' } }),
    );
    expect(() => form.configuration({ ...editor, role: 'view' })).toThrow(
      expect.objectContaining({ failure: { kind: 'role-insufficient' } }),
    );
    expect(() => form.configure(archived, 1, {}, eligibility)).toThrow(
      expect.objectContaining({ failure: { kind: 'list-archived' } }),
    );
    expect(() => form.publish(archived, 1, eligibility, key)).toThrow(
      expect.objectContaining({ failure: { kind: 'list-archived' } }),
    );
  });

  it('merges and versions meaningful changes without mutating the previous configuration', () => {
    const current = published();
    const changed = current.configure(
      editor,
      2,
      {
        title: '  Une demande  ',
        description: null,
        fields: { dueDate: 'disabled', priority: 'required' },
        defaultAssigneeId: assigneeId,
      },
      eligibility,
    );

    expect(changed.snapshot()).toEqual({
      title: 'Une demande',
      description: null,
      fields: {
        description: 'optional',
        priority: 'required',
        dueDate: 'disabled',
        contactEmail: 'required',
      },
      defaultStatus: 'triage',
      defaultAssigneeId: assigneeId,
      publicKey: key,
      version: 3,
    });
    expect(current.snapshot().title).toBe('Déposer une demande');
    expect(changed.configure(editor, 3, {}, eligibility)).toBe(changed);
    expect(changed.configure(editor, 3, { title: ' Une demande ' }, eligibility)).toBe(changed);
    expect(
      changed.configure(editor, 3, { defaultAssigneeId: null }, eligibility).snapshot()
        .defaultAssigneeId,
    ).toBeNull();
    expect(() => changed.configure(editor, 2, {}, eligibility)).toThrow(
      expect.objectContaining({ failure: { kind: 'version-mismatch', currentVersion: 3 } }),
    );
  });

  it('refuses invalid settings and validates the proposed task defaults', () => {
    const form = draft();
    expect(() => form.configure(editor, 1, { title: '   ' }, eligibility)).toThrow(
      expect.objectContaining({ failure: { kind: 'invalid-settings', field: 'title' } }),
    );
    expect(() => form.configure(editor, 1, { title: 'é'.repeat(301) }, eligibility)).toThrow(
      expect.objectContaining({ failure: { kind: 'invalid-settings', field: 'title' } }),
    );
    expect(() => form.configure(editor, 1, { description: 'é'.repeat(501) }, eligibility)).toThrow(
      expect.objectContaining({ failure: { kind: 'invalid-settings', field: 'description' } }),
    );
    expect(() => form.configure(editor, 1, { defaultStatus: 'cancelled' }, eligibility)).toThrow(
      expect.objectContaining({ failure: { kind: 'defaults-invalid', field: 'defaultStatus' } }),
    );
    expect(() => form.configure(editor, 1, { defaultStatus: 'todo' }, invalidDefaults)).toThrow(
      expect.objectContaining({ failure: { kind: 'defaults-invalid', field: 'defaultStatus' } }),
    );
    expect(() =>
      form.configure(
        editor,
        1,
        { defaultAssigneeId: assigneeId },
        { ...eligibility, eligibleAssignees: new Set() },
      ),
    ).toThrow(
      expect.objectContaining({
        failure: { kind: 'defaults-invalid', field: 'defaultAssigneeId' },
      }),
    );
  });

  it('changes the key on republication and rechecks defaults before a repeated publish', () => {
    const live = published();
    expect(live.publish(editor, undefined, eligibility)).toBe(live);
    expect(() => live.publish(editor, 1, eligibility)).toThrow(
      expect.objectContaining({ failure: { kind: 'version-mismatch', currentVersion: 2 } }),
    );
    expect(() => live.publish(editor, 2, invalidDefaults)).toThrow(
      expect.objectContaining({ failure: { kind: 'defaults-invalid', field: 'defaultStatus' } }),
    );
    const disabled = live.disable(archived, 2);
    expect(disabled.snapshot()).toMatchObject({ publicKey: null, version: 3 });
    expect(disabled.disable(editor, undefined)).toBe(disabled);
    expect(disabled.revoke()).toBe(disabled);
    expect(disabled.publish(editor, 3, eligibility, newKey).snapshot()).toMatchObject({
      publicKey: newKey,
      version: 4,
    });
    expect(live.revoke().snapshot()).toMatchObject({ publicKey: null, version: 3 });
    expect(() => draft().publish(editor, 1, eligibility, 'malformed')).toThrow(
      expect.objectContaining({ failure: { kind: 'invalid-publication-key' } }),
    );
  });

  it('exposes only the public projection, suspends on archive, and never exposes invalid keys', () => {
    const live = published();
    for (const [form, context] of [
      [draft(), publication],
      [live, { ...publication, key: newKey }],
      [live, { ...publication, lifecycle: 'archived' }],
      [live, { ...publication, lifecycle: 'removed' }],
      [live, { ...publication, eligibility: invalidDefaults }],
      [live.revoke(), publication],
      [live.revoke().publish(editor, 3, eligibility, newKey), publication],
    ] satisfies readonly [IntakeForm, IntakePublicationContext][]) {
      expect(() => form.publicForm(context)).toThrow(
        expect.objectContaining({ failure: { kind: 'unavailable' } }),
      );
    }
    const { title, description, fields } = live.snapshot();
    expect(live.publicForm(publication)).toEqual({ title, description, fields });
    const stored = { ...live.snapshot(), organizationId: 'private', listId: 'private' };
    const restored = IntakeForm.reconstitute(stored);
    expect(restored.configuration(editor)).toEqual(live.snapshot());
    expect(restored.publicForm(publication)).toEqual({ title, description, fields });
  });

  it('rejects an invalid stored version or an assignee id that cannot identify an account', () => {
    const current = draft().snapshot();
    expect(() => IntakeForm.reconstitute({ ...current, version: 0 })).toThrow(
      expect.objectContaining({ failure: { kind: 'invalid-settings', field: 'version' } }),
    );
    expect(() =>
      draft().configure(editor, 1, { defaultAssigneeId: 'invalid-id' }, eligibility),
    ).toThrow(
      expect.objectContaining({
        failure: { kind: 'defaults-invalid', field: 'defaultAssigneeId' },
      }),
    );
  });

  it('validates fields and produces ordinary task content with the contact held separately', () => {
    const form = published().configure(
      editor,
      2,
      { fields: { description: 'required', priority: 'disabled' }, defaultAssigneeId: assigneeId },
      eligibility,
    );
    const input = {
      title: ' Capitaliser ',
      description: '  **Un compte rendu**  ',
      dueDate: '2028-02-29',
      contactEmail: 'Contact+intake@example.test',
    };
    expect(form.submit(publication, input)).toEqual({
      task: {
        title: 'Capitaliser',
        description: input.description,
        dueDate: input.dueDate,
        priority: 'moyenne',
        status: 'triage',
        assigneeId,
      },
      contactEmail: input.contactEmail,
    });
    expect(() =>
      form.submit(
        { ...publication, eligibility: { ...eligibility, eligibleAssignees: new Set() } },
        input,
      ),
    ).toThrow(expect.objectContaining({ failure: { kind: 'unavailable' } }));
    expect(() =>
      form.submit(publication, {
        title: '  ',
        description: '  ',
        priority: null,
        dueDate: '2026-02-29',
        contactEmail: 'invalid@',
      }),
    ).toThrow(
      expect.objectContaining({
        failure: {
          kind: 'invalid-submission',
          issues: [
            { field: 'title', reason: 'required' },
            { field: 'description', reason: 'required' },
            { field: 'priority', reason: 'disabled' },
            { field: 'dueDate', reason: 'invalid' },
            { field: 'contactEmail', reason: 'invalid' },
          ],
        },
      }),
    );
  });

  it('reports omitted required fields and preserves ordinary defaults for omitted optional fields', () => {
    expect(() => published().submit(publication, { title: 'Une demande' })).toThrow(
      expect.objectContaining({
        failure: {
          kind: 'invalid-submission',
          issues: [{ field: 'contactEmail', reason: 'required' }],
        },
      }),
    );
    const form = published().configure(
      editor,
      2,
      { fields: { contactEmail: 'optional' } },
      eligibility,
    );
    expect(form.submit(publication, { title: 'Une demande', description: null })).toEqual({
      task: {
        title: 'Une demande',
        description: null,
        priority: 'moyenne',
        dueDate: null,
        status: 'triage',
        assigneeId: null,
      },
      contactEmail: null,
    });
  });
});
