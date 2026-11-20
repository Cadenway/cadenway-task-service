import type { IntakeFormConfiguration } from './intake-form-configuration.value-object.js';
import type { IntakeFormFields } from './intake-form-fields.value-object.js';

/** Editable form settings, merged field by field in `components/intake.yaml`. */
export type IntakeFormPatch = Partial<
  Omit<IntakeFormConfiguration, 'fields' | 'publicKey' | 'version'>
> & {
  readonly fields?: Partial<IntakeFormFields>;
};
