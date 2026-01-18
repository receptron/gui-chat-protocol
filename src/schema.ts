/**
 * Schema Types (Framework-agnostic)
 *
 * JSON Schema based types for tool definitions and plugin settings.
 */

// ============================================================================
// JSON Schema
// ============================================================================

/**
 * JSON Schema property definition
 */
export interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  oneOf?: JsonSchemaProperty[];
  [key: string]: unknown;
}

// ============================================================================
// Plugin Config Schema
// ============================================================================

export type ConfigValue = string | number | boolean | string[];

interface BaseFieldSchema {
  label: string;
  description?: string;
  required?: boolean;
}

export interface StringFieldSchema extends BaseFieldSchema {
  type: "string";
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface NumberFieldSchema extends BaseFieldSchema {
  type: "number";
  min?: number;
  max?: number;
  step?: number;
}

export interface BooleanFieldSchema extends BaseFieldSchema {
  type: "boolean";
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectFieldSchema extends BaseFieldSchema {
  type: "select";
  options: SelectOption[];
}

export interface MultiSelectFieldSchema extends BaseFieldSchema {
  type: "multiselect";
  options: SelectOption[];
  minItems?: number;
  maxItems?: number;
}

export type ConfigFieldSchema =
  | StringFieldSchema
  | NumberFieldSchema
  | BooleanFieldSchema
  | SelectFieldSchema
  | MultiSelectFieldSchema;

/**
 * Plugin configuration schema (JSON Schema based)
 */
export interface PluginConfigSchema {
  key: string;
  defaultValue: ConfigValue;
  schema: ConfigFieldSchema;
}
