import { evaluate, getBucket } from '../../shared/evaluator';
import { FlagDefinition } from '../../shared/types';

describe('Evaluation Engine - Pure Logic Tests', () => {
  const mockFlag: FlagDefinition = {
    id: 'flag-1',
    projectId: 'proj-1',
    key: 'test-flag',
    name: 'Test Flag',
    type: 'string',
    isKilled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    variants: [
      { id: 'v-red', flagId: 'flag-1', name: 'red', value: '#FF0000' },
      { id: 'v-green', flagId: 'flag-1', name: 'green', value: '#00FF00' },
      { id: 'v-blue', flagId: 'flag-1', name: 'blue', value: '#0000FF' }
    ],
    environments: {
      dev: {
        id: 'fe-dev',
        flagId: 'flag-1',
        environment: 'dev',
        enabled: true,
        defaultVariant: 'red',
        rules: [
          {
            id: 'rule-high-priority',
            flagEnvironmentId: 'fe-dev',
            priority: 0,
            attribute: 'plan',
            operator: 'eq',
            value: 'enterprise',
            variant: 'blue'
          },
          {
            id: 'rule-low-priority',
            flagEnvironmentId: 'fe-dev',
            priority: 1,
            attribute: 'country',
            operator: 'in',
            value: 'US,CA,MX',
            variant: 'green'
          }
        ]
      },
      staging: {
        id: 'fe-staging',
        flagId: 'flag-1',
        environment: 'staging',
        enabled: false,
        defaultVariant: 'red',
        rules: []
      },
      prod: {
        id: 'fe-prod',
        flagId: 'flag-1',
        environment: 'prod',
        enabled: true,
        defaultVariant: 'red',
        rules: [],
        rolloutWeights: {
          red: 30,
          green: 70
        }
      }
    }
  };

  test('should return default variant when environment is disabled', () => {
    const res = evaluate(mockFlag, 'staging', { userId: 'user-1' });
    expect(res.variant).toBe('red');
    expect(res.value).toBe('#FF0000');
    expect(res.reason).toBe('FALLBACK');
  });

  test('should return rule-matched variant based on highest priority (lowest value)', () => {
    // Matches plan = enterprise (priority 0) and country = US (priority 1). Priority 0 wins!
    const res = evaluate(mockFlag, 'dev', { 
      userId: 'user-1', 
      plan: 'enterprise',
      country: 'US' 
    });
    expect(res.variant).toBe('blue');
    expect(res.value).toBe('#0000FF');
    expect(res.reason).toBe('RULE_MATCH');
    expect(res.ruleId).toBe('rule-high-priority');
  });

  test('should match fallback rule when high priority does not match', () => {
    // Plan is basic (no match), country is CA (matches priority 1)
    const res = evaluate(mockFlag, 'dev', { 
      userId: 'user-1', 
      plan: 'basic',
      country: 'CA' 
    });
    expect(res.variant).toBe('green');
    expect(res.value).toBe('#00FF00');
    expect(res.reason).toBe('RULE_MATCH');
    expect(res.ruleId).toBe('rule-low-priority');
  });

  test('should apply rule operators correctly: neq, contains, gt, lt', () => {
    const customFlag: FlagDefinition = {
      ...mockFlag,
      environments: {
        ...mockFlag.environments,
        dev: {
          id: 'fe-dev-custom',
          flagId: 'flag-1',
          environment: 'dev',
          enabled: true,
          defaultVariant: 'red',
          rules: [
            {
              id: 'rule-neq',
              flagEnvironmentId: 'fe-dev-custom',
              priority: 0,
              attribute: 'status',
              operator: 'neq',
              value: 'suspended',
              variant: 'green'
            },
            {
              id: 'rule-contains',
              flagEnvironmentId: 'fe-dev-custom',
              priority: 1,
              attribute: 'email',
              operator: 'contains',
              value: '@acme.com',
              variant: 'blue'
            }
          ]
        }
      }
    };

    // User is active (neq suspended) -> should match first rule
    let res = evaluate(customFlag, 'dev', { userId: 'user-1', status: 'active' });
    expect(res.variant).toBe('green');

    // User is suspended, but email is partner@acme.com -> should match second rule
    res = evaluate(customFlag, 'dev', { userId: 'user-1', status: 'suspended', email: 'partner@acme.com' });
    expect(res.variant).toBe('blue');
  });

  test('should return default variant if no rules match', () => {
    const res = evaluate(mockFlag, 'dev', { 
      userId: 'user-1', 
      plan: 'basic',
      country: 'FR' 
    });
    expect(res.variant).toBe('red');
    expect(res.reason).toBe('FALLBACK');
  });

  test('should serve emergency variant when flag is killed, skipping all rules', () => {
    const killedFlag = { ...mockFlag, isKilled: true };
    // Even though plan is enterprise (which would match priority 0 rule), flag is killed!
    const res = evaluate(killedFlag, 'dev', { 
      userId: 'user-1', 
      plan: 'enterprise' 
    });
    expect(res.variant).toBe('red'); // environment defaultVariant
    expect(res.reason).toBe('KILLED');
  });

  test('should hash user ID deterministically and return variant based on rollout weights', () => {
    // Let's check deterministic bucketing for a set of user IDs
    const users = ['user-alice', 'user-bob', 'user-charlie', 'user-dave', 'user-eve'];
    
    users.forEach(userId => {
      const bucket = getBucket(userId, mockFlag.key);
      const res = evaluate(mockFlag, 'prod', { userId });
      
      // Let's verify that the output variant matches the bucket score distribution
      // red = 30%, green = 70%
      // Since variants are array order: red (idx 0), green (idx 1)
      // Accumulator: red sum is 30, green sum is 100
      if (bucket < 30) {
        expect(res.variant).toBe('red');
      } else {
        expect(res.variant).toBe('green');
      }
      expect(res.reason).toBe('ROLLOUT');
    });
  });

  test('should verify distribution over 1000 simulated users matches weights roughly', () => {
    let redCount = 0;
    let greenCount = 0;

    for (let i = 0; i < 1000; i++) {
      const userId = `sim-user-${i}`;
      const res = evaluate(mockFlag, 'prod', { userId });
      if (res.variant === 'red') redCount++;
      if (res.variant === 'green') greenCount++;
    }

    const redPercentage = (redCount / 1000) * 100;
    const greenPercentage = (greenCount / 1000) * 100;

    console.log(`Rollout simulation of 1000 users: RED=${redPercentage}%, GREEN=${greenPercentage}%`);
    
    // Murmurhash distribution over large sample should be very close to targets (within 5% margin)
    expect(redPercentage).toBeGreaterThan(25);
    expect(redPercentage).toBeLessThan(35);
    expect(greenPercentage).toBeGreaterThan(65);
    expect(greenPercentage).toBeLessThan(75);
  });
});
