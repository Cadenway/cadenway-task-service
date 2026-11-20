import type { IntakeFormConfiguration } from './intake-form-configuration.value-object.js';

/** The only information visible to an applicant, per `components/intake.yaml`. */
export type PublicIntakeForm = Pick<IntakeFormConfiguration, 'title' | 'description' | 'fields'>;
