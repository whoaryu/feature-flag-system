export type VariantValue = unknown; // boolean, string, number, JSON object/array

export type FlagType = 'bool' | 'string' | 'number' | 'json';

export interface FlagVariant {
  id: string;
  flagId: string;
  name: string;
  value: VariantValue;
}

export interface FlagRule {
  id: string;
  flagEnvironmentId: string;
  priority: number; // lower evaluated first (0, 1, 2...)
  attribute: string; // e.g. "email", "country", "plan", "userId"
  operator: 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'contains';
  value: string; // value to check against (can be comma-separated list for 'in')
  variant: string; // variant name or variant id to return
}

export interface FlagEnvironment {
  id: string;
  flagId: string;
  environment: 'dev' | 'staging' | 'prod';
  enabled: boolean;
  defaultVariant: string; // variant name (fallback variant name)
  rules: FlagRule[];
  rolloutPercentage?: number; // Optional rollout percentage (0-100)
  rolloutWeights?: Record<string, number>; // Optional weight distribution (e.g. { "control": 50, "treatment": 50 })
}

export interface FlagDefinition {
  id: string;
  projectId: string;
  key: string;
  name: string;
  type: FlagType;
  isKilled: boolean;
  environments: Record<'dev' | 'staging' | 'prod', FlagEnvironment>;
  variants: FlagVariant[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectEnvironment {
  id: string;
  projectId: string;
  environment: 'dev' | 'staging' | 'prod';
  sdkKey: string;
  clientKey: string;
  createdAt: Date;
}

export interface Project {
  id: string;
  name: string;
  environments: Record<'dev' | 'staging' | 'prod', ProjectEnvironment>;
  createdAt: Date;
}

export interface UserContext {
  userId: string;
  email?: string;
  country?: string;
  plan?: string;
  [key: string]: unknown; // supports any custom context fields
}

export type EvalReason = 'KILLED' | 'RULE_MATCH' | 'ROLLOUT' | 'FALLBACK';

export interface EvalResult {
  variant: string; // Variant name
  value: VariantValue; // Concrete variant value
  reason: EvalReason;
  ruleId?: string; // If matched by rule
}

export interface AuditLog {
  id: string;
  flagId: string;
  flagKey: string;
  actorId: string;
  actorName: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'TOGGLE' | 'KILL';
  environment?: 'dev' | 'staging' | 'prod';
  beforeSnapshot?: any;
  afterSnapshot?: any;
  timestamp: Date;
}

export interface FlagEvaluation {
  id: string;
  flagId: string;
  flagKey: string;
  environment: 'dev' | 'staging' | 'prod';
  variantReturned: string;
  userId: string;
  timestamp: Date;
}
