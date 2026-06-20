import murmurhash from 'murmurhash-js';
import { FlagDefinition, UserContext, EvalResult, FlagRule, VariantValue } from './types';

/**
 * Stable hashing strategy for rollout bucketing.
 * Hash input = userId + ':' + flagKey.
 * Result % 100 gives bucket 0-99.
 */
export function getBucket(userId: string, flagKey: string): number {
  const seed = `${userId}:${flagKey}`;
  const fn = (murmurhash as any).v3 || murmurhash;
  return fn(seed) % 100; // returns 0-99
}

/**
 * Checks if a user attribute matches a rule's criteria.
 */
export function matchRuleCondition(userValue: unknown, operator: string, ruleValue: string): boolean {
  if (userValue === undefined || userValue === null) {
    return false;
  }

  const userStr = String(userValue).trim();
  const ruleStr = ruleValue.trim();

  switch (operator) {
    case 'eq':
      return userStr === ruleStr;
    case 'neq':
      return userStr !== ruleStr;
    case 'in': {
      // Rule value is a comma-separated list
      const list = ruleStr.split(',').map(item => item.trim());
      return list.includes(userStr);
    }
    case 'contains':
      return userStr.includes(ruleStr);
    case 'gt': {
      const uNum = Number(userValue);
      const rNum = Number(ruleValue);
      if (!isNaN(uNum) && !isNaN(rNum)) {
        return uNum > rNum;
      }
      return userStr > ruleStr;
    }
    case 'lt': {
      const uNum = Number(userValue);
      const rNum = Number(ruleValue);
      if (!isNaN(uNum) && !isNaN(rNum)) {
        return uNum < rNum;
      }
      return userStr < ruleStr;
    }
    default:
      return false;
  }
}

/**
 * Pure evaluation engine - no DB calls, no side effects.
 * 
 * Rule resolution:
 * 1. If flag is killed -> returns KILLED reason, bypasses rules, returns environment default variant.
 * 2. If environment is disabled -> returns FALLBACK reason, returns environment default variant.
 * 3. First matching rule wins.
 * 4. If no rule matches and user is in rollout bucket -> ROLLOUT.
 * 5. If neither -> FALLBACK (default_variant).
 */
export function evaluate(
  flag: FlagDefinition,
  environmentName: 'dev' | 'staging' | 'prod',
  userCtx: UserContext
): EvalResult {
  const env = flag.environments[environmentName];

  // If environment isn't defined, fallback to first variant or null
  const defaultVarName = env ? env.defaultVariant : (flag.variants[0]?.name || '');
  const defaultVar = flag.variants.find(v => v.name === defaultVarName) || flag.variants[0];
  const defaultValue = defaultVar ? defaultVar.value : null;

  if (flag.isKilled) {
    return {
      variant: defaultVarName,
      value: defaultValue,
      reason: 'KILLED'
    };
  }

  if (!env || !env.enabled) {
    return {
      variant: defaultVarName,
      value: defaultValue,
      reason: 'FALLBACK'
    };
  }

  // 1. Rule Evaluation (ordered by priority ascending)
  const sortedRules = [...env.rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sortedRules) {
    const userValue = userCtx[rule.attribute];
    if (matchRuleCondition(userValue, rule.operator, rule.value)) {
      const matchedVar = flag.variants.find(v => v.name === rule.variant);
      return {
        variant: rule.variant,
        value: matchedVar ? matchedVar.value : null,
        reason: 'RULE_MATCH',
        ruleId: rule.id
      };
    }
  }

  // 2. Rollout Bucketing
  const bucket = getBucket(userCtx.userId, flag.key);

  // If rollout weights are defined, distribute based on them
  if (env.rolloutWeights && Object.keys(env.rolloutWeights).length > 0) {
    let sum = 0;
    // Iterate variants in defined order for consistency
    for (const variant of flag.variants) {
      const weight = env.rolloutWeights[variant.name] || 0;
      sum += weight;
      if (bucket < sum) {
        return {
          variant: variant.name,
          value: variant.value,
          reason: 'ROLLOUT'
        };
      }
    }
  }

  // If rolloutPercentage is defined (simple rollout)
  if (env.rolloutPercentage !== undefined && env.rolloutPercentage !== null) {
    // Determine the rollout variant (typically the non-default one, or the first active one)
    const targetVariant = flag.variants.find(v => v.name !== defaultVarName) || flag.variants[0];
    if (targetVariant && bucket < env.rolloutPercentage) {
      return {
        variant: targetVariant.name,
        value: targetVariant.value,
        reason: 'ROLLOUT'
      };
    }
  }

  // 3. Fallback (default_variant)
  return {
    variant: defaultVarName,
    value: defaultValue,
    reason: 'FALLBACK'
  };
}
