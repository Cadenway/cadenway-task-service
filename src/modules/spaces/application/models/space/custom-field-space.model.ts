/** A visible space's actual access and management permission. */
export interface CustomFieldSpace {
  // #region Properties
  /** State used by this operation. */
  readonly role: 'edit' | 'comment' | 'view';
  readonly canManage: boolean;
  // #endregion
}
