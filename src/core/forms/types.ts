/**
 * Form engine types. Pure data — no React, no Firebase, no I/O.
 * See docs/SPEC_FORM_ENGINE.md
 */

export type FieldId = string;
export type FieldKey = string;

export type FieldType =
  | 'shortText'
  | 'longText'
  | 'number'
  | 'email'
  | 'dropdown'
  | 'radio'
  | 'multiSelect'
  | 'checkbox'
  | 'date'
  | 'rating'
  | 'url'
  | 'githubRepo'
  | 'file'
  | 'files'
  /* Phase 2 additions — purely additive via the registry. */
  | 'phone'
  | 'time'
  | 'datetime'
  | 'currency'
  | 'slider'
  | 'linearScale'
  | 'ranking'
  | 'driveLink'
  | 'videoUrl'
  | 'address';

export interface FieldOption {
  id: string;
  label: string;
  value: string;
}

export interface FieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
  minSelections?: number;
  maxSelections?: number;
  maxFileSizeMB?: number;
  acceptedMimeTypes?: string[];
  maxFiles?: number;
}

export type ConditionOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'contains'
  | 'isEmpty'
  | 'isNotEmpty';

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: FieldKey; op: ConditionOp; value?: unknown };

export interface FormField {
  id: FieldId;
  key: FieldKey;
  type: FieldType;
  label: string;
  help: string | null;
  placeholder: string | null;
  required: boolean;
  order: number;
  defaultValue: unknown;
  options: FieldOption[] | null;
  validation: FieldValidation;
  config: Record<string, unknown>;
  visibleWhen: Condition | null;
  width: 'full' | 'half';
  piiLevel: 'none' | 'low' | 'high';
}

export interface FormSection {
  id: string;
  title: string;
  description: string | null;
  order: number;
  fields: FormField[];
  visibleWhen: Condition | null;
}

export interface FormSchema {
  id: string;
  orgId: string;
  version: number;
  status: 'draft' | 'published' | 'archived';
  title: string;
  description: string | null;
  sections: FormSection[];
  settings: {
    allowDrafts: boolean;
    showProgressBar: boolean;
    confirmationMessage: string | null;
  };
}

export type Answers = Record<FieldKey, unknown>;

export interface FileRef {
  provider: 'googleDrive' | 'firebase' | 's3' | 'r2';
  fileId: string;
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface FieldError {
  key: FieldKey;
  message: string;
}
