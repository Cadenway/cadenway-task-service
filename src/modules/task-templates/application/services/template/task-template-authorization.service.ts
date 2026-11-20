import type { TaskTemplateAccess } from '../../models/template/task-template-access.model.js';
import type { TaskTemplateCaller } from '../../models/template/task-template-caller.model.js';
import type { TaskTemplateDraft } from '../../models/template/task-template-draft.model.js';
import { TaskTemplateRefusal } from '../../models/template/task-template-refusal.model.js';
import type { TaskTemplateSourceDirectory } from '../../ports/outbound/source/template/task-template-source-directory.port.js';

/** Enforces the required library roles and source audience. */
export class TaskTemplateAuthorization {
  // #region Constructor
  /** Uses the space and source policies of the owning modules. */
  public constructor(private readonly sources: TaskTemplateSourceDirectory) {}
  // #endregion

  // #region Methods
  /** Requires an actual space role and edit when writing. */
  public async requireSpace(
    input: TaskTemplateCaller,
    mode: 'read' | 'prepare' | 'write',
  ): Promise<void> {
    this.requireRole(await this.sources.scope(input, mode), mode !== 'read');
  }

  /** Rechecks source access and audience under the locks before returning task content. */
  public async readSource(
    input: TaskTemplateCaller,
    taskKey: string,
  ): Promise<Omit<TaskTemplateDraft, 'organizationId' | 'spaceId' | 'name'>> {
    const result = await this.sources.task(input, taskKey);
    if (result.outcome === 'refused') {
      throw new TaskTemplateRefusal(result.status, result.code, result.details);
    }
    const { listId, ...content } = result.source;
    const scope = this.requireRole(await this.sources.scope(input, 'write', listId), true);
    if (scope.listRole === null) {
      throw new TaskTemplateRefusal(404, 'task.not-found');
    }
    if (scope.listRole !== 'edit') {
      throw new TaskTemplateRefusal(403, 'access.role-insufficient', {
        role: scope.listRole,
        requiredRole: 'edit',
      });
    }
    if (scope.sourceRestricted) {
      throw new TaskTemplateRefusal(422, 'template.source-restricted');
    }
    return content;
  }

  /** Requires an actual space role, and edit on writes. */
  private requireRole(
    scope: TaskTemplateAccess,
    edit: boolean,
  ): Extract<TaskTemplateAccess, { outcome: 'found' }> {
    switch (scope.outcome) {
      case 'organization-not-found':
        throw new TaskTemplateRefusal(404, 'organization.not-found');
      case 'space-not-found':
        throw new TaskTemplateRefusal(404, 'space.not-found');
      case 'found':
        break;
    }
    if (edit && scope.spaceRole !== 'edit') {
      throw new TaskTemplateRefusal(403, 'access.role-insufficient', {
        role: scope.spaceRole,
        requiredRole: 'edit',
      });
    }
    return scope;
  }
  // #endregion
}
