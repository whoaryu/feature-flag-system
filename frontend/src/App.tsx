import React, { useState, useEffect, useRef } from 'react';
import { 
  api 
} from './services/api';
import { 
  Layers, 
  Flag, 
  History, 
  Settings, 
  Plus, 
  Trash2, 
  Check, 
  X, 
  LogOut, 
  User, 
  Search, 
  ShieldAlert, 
  Save, 
  Sliders, 
  Sparkles, 
  ChevronRight, 
  Info,
  HelpCircle,
  Copy,
  Activity
} from 'lucide-react';

// ==========================================
// PURE CLIENT-SIDE SDK EVALUATION ENGINE
// ==========================================

function murmurhash3_32_gc(key: string, seed = 0): number {
  let remainder = key.length & 3;
  let bytes = key.length - remainder;
  let h1 = seed;
  let c1 = 0xcc9e2d51;
  let c2 = 0x1b873593;
  let i = 0;
  
  while (i < bytes) {
    let k1 =
      ((key.charCodeAt(i) & 0xff)) |
      ((key.charCodeAt(i + 1) & 0xff) << 8) |
      ((key.charCodeAt(i + 2) & 0xff) << 16) |
      ((key.charCodeAt(i + 3) & 0xff) << 24);
    i += 4;
    
    k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
    
    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    let h1b = (((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16)) & 0xffffffff;
    h1 = (((h1b & 0xffff) + 0x6b64) + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16)) & 0xffffffff;
  }
  
  let k1 = 0;
  switch (remainder) {
    case 3:
      k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
      // fallthrough
    case 2:
      k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
      // fallthrough
    case 1:
      k1 ^= (key.charCodeAt(i) & 0xff);
      k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
      h1 ^= k1;
  }
  
  h1 ^= key.length;
  h1 ^= h1 >>> 16;
  h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
  h1 ^= h1 >>> 13;
  h1 = (((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16)) & 0xffffffff;
  h1 ^= h1 >>> 16;
  
  return h1 >>> 0;
}

function getBucketLocal(userId: string, flagKey: string): number {
  const seed = `${userId}:${flagKey}`;
  return murmurhash3_32_gc(seed) % 100;
}

function matchRuleConditionLocal(userValue: any, operator: string, ruleValue: string): boolean {
  if (userValue === undefined || userValue === null) return false;
  const userStr = String(userValue).trim();
  const ruleStr = ruleValue.trim();

  switch (operator) {
    case 'eq': return userStr === ruleStr;
    case 'neq': return userStr !== ruleStr;
    case 'in': {
      const list = ruleStr.split(',').map(item => item.trim());
      return list.includes(userStr);
    }
    case 'contains': return userStr.includes(ruleStr);
    case 'gt': {
      const uNum = Number(userValue);
      const rNum = Number(ruleValue);
      if (!isNaN(uNum) && !isNaN(rNum)) return uNum > rNum;
      return userStr > ruleStr;
    }
    case 'lt': {
      const uNum = Number(userValue);
      const rNum = Number(ruleValue);
      if (!isNaN(uNum) && !isNaN(rNum)) return uNum < rNum;
      return userStr < ruleStr;
    }
    default: return false;
  }
}

function evaluateLocal(flag: any, environmentName: 'dev' | 'staging' | 'prod', userCtx: any) {
  const env = flag.environments[environmentName];
  const defaultVarName = env ? env.defaultVariant : (flag.variants[0]?.name || '');
  const defaultVar = flag.variants.find((v: any) => v.name === defaultVarName) || flag.variants[0];
  const defaultValue = defaultVar ? defaultVar.value : null;

  if (flag.isKilled) {
    return { variant: defaultVarName, value: defaultValue, reason: 'KILLED' };
  }

  if (!env || !env.enabled) {
    return { variant: defaultVarName, value: defaultValue, reason: 'FALLBACK' };
  }

  // 1. Rule evaluation
  const sortedRules = [...env.rules].sort((a: any, b: any) => a.priority - b.priority);
  for (const rule of sortedRules) {
    const userValue = userCtx[rule.attribute];
    if (matchRuleConditionLocal(userValue, rule.operator, rule.value)) {
      const matchedVar = flag.variants.find((v: any) => v.name === rule.variant);
      return {
        variant: rule.variant,
        value: matchedVar ? matchedVar.value : null,
        reason: 'RULE_MATCH',
        ruleId: rule.id,
        ruleDetails: `${rule.attribute} ${rule.operator} "${rule.value}"`
      };
    }
  }

  // 2. Percentage Rollout
  const bucket = getBucketLocal(userCtx.userId, flag.key);
  if (env.rolloutWeights && Object.keys(env.rolloutWeights).length > 0) {
    let sum = 0;
    for (const variant of flag.variants) {
      const weight = env.rolloutWeights[variant.name] || 0;
      sum += weight;
      if (bucket < sum) {
        return {
          variant: variant.name,
          value: variant.value,
          reason: 'ROLLOUT',
          bucket
        };
      }
    }
  }

  if (env.rolloutPercentage !== undefined && env.rolloutPercentage !== null) {
    const targetVariant = flag.variants.find((v: any) => v.name !== defaultVarName) || flag.variants[0];
    if (targetVariant && bucket < env.rolloutPercentage) {
      return {
        variant: targetVariant.name,
        value: targetVariant.value,
        reason: 'ROLLOUT',
        bucket
      };
    }
  }

  return { variant: defaultVarName, value: defaultValue, reason: 'FALLBACK', bucket };
}

export default function App() {
  const [admin, setAdmin] = useState<any>(null);
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('admin123');
  const [authError, setAuthError] = useState('');
  const [signingUp, setSigningUp] = useState(false);
  const [signupName, setSignupName] = useState('');

  const [projects, setProjects] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [flags, setFlags] = useState<any[]>([]);
  const [selectedFlag, setSelectedFlag] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // View state
  const [activeTab, setActiveTab] = useState<'flags' | 'audit' | 'settings' | 'simulator'>('flags');
  const [showCreateFlagModal, setShowCreateFlagModal] = useState(false);
  const [showCreateProjModal, setShowCreateProjModal] = useState(false);

  // Simulator State
  const [simulationEnv, setSimulationEnv] = useState<'dev' | 'staging' | 'prod'>('dev');
  const [simulatorUser, setSimulatorUser] = useState({ userId: 'user-premium-101', email: 'alice@acme.com', plan: 'premium', country: 'US' });
  const [customAttrs, setCustomAttrs] = useState<Array<{ key: string; val: string }>>([]);
  const [simulatorLogs, setSimulatorLogs] = useState<Array<{ text: string; type: 'info' | 'success' | 'warning' | 'danger'; timestamp: string }>>([]);
  const [simResults, setSimResults] = useState<Record<string, { variant: string; value: any; reason: string; ruleDetails?: string; bucket?: number }>>({});

  // Tutorial Onboarding State
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 100, left: 100 });
  const [confetti, setConfetti] = useState(false);

  // New Project Form
  const [newProjName, setNewProjName] = useState('');

  // New Flag Form
  const [newFlagKey, setNewFlagKey] = useState('');
  const [newFlagName, setNewFlagName] = useState('');
  const [newFlagType, setNewFlagType] = useState<'bool' | 'string' | 'number' | 'json'>('bool');
  const [newFlagVariants, setNewFlagVariants] = useState<Array<{ name: string; value: any }>>([
    { name: 'true', value: true },
    { name: 'false', value: false }
  ]);

  // Selected Flag Environment Tab
  const [selectedEnv, setSelectedEnv] = useState<'dev' | 'staging' | 'prod'>('dev');

  // Stats State
  const [flagStats, setFlagStats] = useState<any>(null);

  // Notification Alerts
  const [alert, setAlert] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Auto-clear alert
  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  // Auto-clear confetti
  useEffect(() => {
    if (confetti) {
      const timer = setTimeout(() => setConfetti(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [confetti]);

  const steps = [
    {
      target: '#brand-logo',
      title: 'Welcome to Antigravity!',
      body: 'This dashboard helps you manage, target, and gradually rollout features to your users in real time. Let\'s take a quick tour!'
    },
    {
      target: '#project-selector-container',
      title: 'Project Management',
      body: 'Organize your configurations by projects. You can switch projects or create a new one using the "New Project" button.'
    },
    {
      target: '#sidebar-flags',
      title: 'Feature Flags List',
      body: 'This is where you view all flags. You can see their keys, types, environmental toggle statuses, and active rules.'
    },
    {
      target: '#create-flag-btn',
      title: 'Create Feature Flags',
      body: 'Click here to add new flags. You can define flag keys, user-friendly names, and customize variants (Boolean, String, Number, or JSON!).'
    },
    {
      target: '#sidebar-simulator',
      title: 'Live Simulator Playground',
      body: 'Switch to this tab to play with a simulated app in real time! Modify user country, plan tier, or user ID to see flags evaluate instantly.'
    },
    {
      target: '#sidebar-settings',
      title: 'SDK Keys & Settings',
      body: 'Get your SDK environment keys here to integrate Antigravity\'s sub-5ms evaluator in your own servers and frontend apps!'
    }
  ];

  const endTutorial = () => {
    document.querySelectorAll('.tutorial-spotlight').forEach(node => node.classList.remove('tutorial-spotlight'));
    setTutorialStep(null);
  };

  useEffect(() => {
    if (tutorialStep === null) return;
    const step = steps[tutorialStep - 1];
    const selector = step.target;
    
    // Auto-adjust active tab for step context
    if (selector === '#create-flag-btn') {
      setActiveTab('flags');
      setSelectedFlag(null);
    }

    const timer = setTimeout(() => {
      const el = document.querySelector(selector);
      if (el) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        document.querySelectorAll('.tutorial-spotlight').forEach(node => node.classList.remove('tutorial-spotlight'));
        el.classList.add('tutorial-spotlight');
        
        const rect = el.getBoundingClientRect();
        let top = rect.bottom + window.scrollY + 12;
        let left = rect.left + window.scrollX;
        
        if (selector === '#brand-logo') {
          top = rect.top + window.scrollY;
          left = rect.right + window.scrollX + 20;
        } else if (selector === '#sidebar-flags' || selector === '#sidebar-simulator' || selector === '#sidebar-settings') {
          top = rect.top + window.scrollY;
          left = rect.right + window.scrollX + 20;
        } else if (selector === '#create-flag-btn') {
          top = rect.bottom + window.scrollY + 12;
          left = rect.left + window.scrollX - 100;
        }
        
        if (left + 380 > window.innerWidth) {
          left = window.innerWidth - 400;
        }
        if (left < 10) left = 10;
        if (top + 220 > window.innerHeight + window.scrollY) {
          top = rect.top + window.scrollY - 200;
        }
        
        setPopoverPos({ top, left });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [tutorialStep]);

  const addSimLog = (text: string, type: 'info' | 'success' | 'warning' | 'danger' = 'info') => {
    setSimulatorLogs(prev => [
      { text, type, timestamp: new Date().toLocaleTimeString() },
      ...prev.slice(0, 49)
    ]);
  };

  useEffect(() => {
    if (activeTab !== 'simulator') return;
    
    const userContext = {
      ...simulatorUser,
      ...customAttrs.reduce((acc, curr) => {
        if (curr.key.trim()) acc[curr.key.trim()] = curr.val;
        return acc;
      }, {} as Record<string, any>)
    };

    const results: Record<string, any> = {};
    flags.forEach(flag => {
      results[flag.key] = evaluateLocal(flag, simulationEnv, userContext);
    });
    setSimResults(results);

    if (flags.length > 0) {
      addSimLog(`Running SDK Local Evaluations for User "${userContext.userId}" in [${simulationEnv.toUpperCase()}]...`, 'info');
      flags.forEach(flag => {
        const res = results[flag.key];
        if (res) {
          let details = '';
          if (res.reason === 'RULE_MATCH') details = ` -> Rule matched: ${res.ruleDetails}`;
          if (res.reason === 'ROLLOUT') details = ` -> Rollout weight: bucket=${res.bucket}`;
          if (res.reason === 'KILLED') details = ` -> Flag is emergency bypassed (KILLED)`;
          addSimLog(`[SDK] flag "${flag.key}" evaluated to "${res.variant}" (value: ${JSON.stringify(res.value)}) [Reason: ${res.reason}${details}]`, 'success');
        }
      });
    } else {
      addSimLog('No feature flags found in active project. Click "Setup Simulator Demo Flags" to initialize sample flags!', 'warning');
    }
  }, [flags, simulatorUser, customAttrs, simulationEnv, activeTab]);

  const handleBootstrapDemoFlags = async () => {
    if (!activeProjectId) return;
    try {
      addSimLog('Initializing simulator demo flags in database...', 'info');
      
      // 1. Beta banner
      await api.createFlag(activeProjectId, 'show-beta-banner', 'Show Beta Promotional Banner', 'bool', [
        { name: 'true', value: true },
        { name: 'false', value: false }
      ]);
      addSimLog('Created show-beta-banner flag.', 'success');

      // 2. Pricing discount
      await api.createFlag(activeProjectId, 'pricing-discount-tier', 'Pricing Discount Tier', 'string', [
        { name: 'none', value: 'none' },
        { name: 'standard', value: 'standard' },
        { name: 'vip', value: 'vip' }
      ]);
      addSimLog('Created pricing-discount-tier flag.', 'success');

      // 3. Checkout button
      await api.createFlag(activeProjectId, 'new-checkout-flow', 'New Animated Checkout Button', 'string', [
        { name: 'legacy', value: 'legacy' },
        { name: 'v2-modern', value: 'v2-modern' }
      ]);
      addSimLog('Created new-checkout-flow flag.', 'success');

      // 4. Dark mode preview
      await api.createFlag(activeProjectId, 'dark-mode-preview', 'Dark Mode Theme Preview', 'bool', [
        { name: 'true', value: true },
        { name: 'false', value: false }
      ]);
      addSimLog('Created dark-mode-preview flag.', 'success');

      await loadFlags();
      addSimLog('Configuring default targeting rules for demo flags...', 'info');
      const refreshedFlags = await api.listFlags(activeProjectId);
      
      // Configure show-beta-banner: DEV enabled, default false, plan=premium -> true
      const f1 = refreshedFlags.find((f: any) => f.key === 'show-beta-banner');
      if (f1) {
        f1.environments.dev.enabled = true;
        f1.environments.dev.defaultVariant = 'false';
        f1.environments.dev.rules = [
          {
            id: `rule-${uuid()}`,
            flagEnvironmentId: f1.environments.dev.id,
            priority: 0,
            attribute: 'plan',
            operator: 'eq',
            value: 'premium',
            variant: 'true'
          }
        ];
        await api.updateFlag(f1.id, f1);
      }

      // Configure pricing-discount-tier: DEV enabled, default none, plan=enterprise -> vip, country=US -> standard
      const f2 = refreshedFlags.find((f: any) => f.key === 'pricing-discount-tier');
      if (f2) {
        f2.environments.dev.enabled = true;
        f2.environments.dev.defaultVariant = 'none';
        f2.environments.dev.rules = [
          {
            id: `rule-${uuid()}`,
            flagEnvironmentId: f2.environments.dev.id,
            priority: 0,
            attribute: 'plan',
            operator: 'eq',
            value: 'enterprise',
            variant: 'vip'
          },
          {
            id: `rule-${uuid()}`,
            flagEnvironmentId: f2.environments.dev.id,
            priority: 1,
            attribute: 'country',
            operator: 'eq',
            value: 'US',
            variant: 'standard'
          }
        ];
        await api.updateFlag(f2.id, f2);
      }

      // Configure new-checkout-flow: DEV enabled, default legacy, plan=premium -> v2-modern
      const f3 = refreshedFlags.find((f: any) => f.key === 'new-checkout-flow');
      if (f3) {
        f3.environments.dev.enabled = true;
        f3.environments.dev.defaultVariant = 'legacy';
        f3.environments.dev.rules = [
          {
            id: `rule-${uuid()}`,
            flagEnvironmentId: f3.environments.dev.id,
            priority: 0,
            attribute: 'plan',
            operator: 'eq',
            value: 'premium',
            variant: 'v2-modern'
          }
        ];
        await api.updateFlag(f3.id, f3);
      }

      // Configure dark-mode-preview: DEV enabled, default false, 50% rollout weight splits
      const f4 = refreshedFlags.find((f: any) => f.key === 'dark-mode-preview');
      if (f4) {
        f4.environments.dev.enabled = true;
        f4.environments.dev.defaultVariant = 'false';
        f4.environments.dev.rolloutWeights = {
          'true': 50,
          'false': 50
        };
        await api.updateFlag(f4.id, f4);
      }

      addSimLog('Successfully configured all simulation flags!', 'success');
      triggerAlert('success', 'Simulator Demo flags bootstrapped successfully!');
      setConfetti(true);
      loadFlags();
      loadAuditLogs();
    } catch (err: any) {
      addSimLog(`Error bootstrapping demo flags: ${err.message}`, 'danger');
      triggerAlert('error', `Bootstrapping failed: ${err.message}`);
    }
  };

  // Authenticate on mount
  useEffect(() => {
    const token = localStorage.getItem('ff_admin_token');
    if (token) {
      api.getMe()
        .then((res: any) => {
          setAdmin(res.admin);
          loadProjects();
        })
        .catch(() => {
          api.logout();
        });
    }
  }, []);

  // Fetch flags & logs when active project changes
  useEffect(() => {
    if (activeProjectId) {
      loadFlags();
      loadAuditLogs();
    }
  }, [activeProjectId]);

  // Fetch stats when selected flag changes
  useEffect(() => {
    if (selectedFlag && activeProjectId) {
      loadFlagStats(selectedFlag.id);
    }
  }, [selectedFlag, activeProjectId]);

  const triggerAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
  };

  const loadProjects = async () => {
    try {
      const projs = await api.listProjects();
      setProjects(projs);
      if (projs.length > 0 && !activeProjectId) {
        setActiveProjectId(projs[0].id);
      }
    } catch (e: any) {
      triggerAlert('error', e.message);
    }
  };

  const loadFlags = async () => {
    try {
      const list = await api.listFlags(activeProjectId);
      setFlags(list);
      // Update selected flag definition in place if editing
      if (selectedFlag) {
        const updatedSelected = list.find((f: any) => f.id === selectedFlag.id);
        if (updatedSelected) {
          setSelectedFlag(updatedSelected);
        }
      }
    } catch (e: any) {
      triggerAlert('error', 'Failed to fetch flags.');
    }
  };

  const loadAuditLogs = async () => {
    try {
      const logs = await api.getAuditLogs(activeProjectId);
      setAuditLogs(logs);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadFlagStats = async (id: string) => {
    try {
      const stats = await api.getFlagStats(id, activeProjectId);
      setFlagStats(stats);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await api.login(email, password);
      setAdmin(res.admin);
      triggerAlert('success', `Welcome back, ${res.admin.name}!`);
      loadProjects();
    } catch (e: any) {
      setAuthError(e.message || 'Login failed.');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await api.signup(email, password, signupName);
      setAdmin(res.admin);
      triggerAlert('success', `Account created successfully!`);
      loadProjects();
    } catch (e: any) {
      setAuthError(e.message || 'Signup failed.');
    }
  };

  const handleLogout = () => {
    api.logout();
    setAdmin(null);
    setProjects([]);
    setFlags([]);
    setSelectedFlag(null);
    setActiveProjectId('');
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    try {
      const proj = await api.createProject(newProjName);
      setProjects([...projects, proj]);
      setActiveProjectId(proj.id);
      setNewProjName('');
      setShowCreateProjModal(false);
      triggerAlert('success', 'Project created successfully.');
      setConfetti(true);
    } catch (e: any) {
      triggerAlert('error', e.message);
    }
  };

  const handleCreateFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFlagKey.trim() || !newFlagName.trim()) {
      return triggerAlert('error', 'Please fill in Key and Name.');
    }
    try {
      const flag = await api.createFlag(
        activeProjectId,
        newFlagKey,
        newFlagName,
        newFlagType,
        newFlagVariants
      );
      setFlags([...flags, flag]);
      setShowCreateFlagModal(false);
      setNewFlagKey('');
      setNewFlagName('');
      triggerAlert('success', 'Feature flag created.');
      loadAuditLogs();
      setConfetti(true);
    } catch (e: any) {
      triggerAlert('error', e.message);
    }
  };

  const handleFlagTypeChange = (type: 'bool' | 'string' | 'number' | 'json') => {
    setNewFlagType(type);
    if (type === 'bool') {
      setNewFlagVariants([
        { name: 'true', value: true },
        { name: 'false', value: false }
      ]);
    } else {
      setNewFlagVariants([
        { name: 'Variation 1', value: '' }
      ]);
    }
  };

  const addVariantField = () => {
    setNewFlagVariants([...newFlagVariants, { name: `Variation ${newFlagVariants.length + 1}`, value: '' }]);
  };

  const removeVariantField = (index: number) => {
    if (newFlagVariants.length === 1) return;
    const next = [...newFlagVariants];
    next.splice(index, 1);
    setNewFlagVariants(next);
  };

  const updateVariantValue = (index: number, field: 'name' | 'value', val: string) => {
    const next = [...newFlagVariants];
    if (field === 'name') {
      next[index].name = val;
    } else {
      let typedVal: any = val;
      if (newFlagType === 'number') {
        typedVal = Number(val);
      } else if (newFlagType === 'json') {
        try {
          typedVal = JSON.parse(val);
        } catch {
          typedVal = val; // leave as raw string while typing
        }
      }
      next[index].value = typedVal;
    }
    setNewFlagVariants(next);
  };

  const handleSaveFlagDetails = async () => {
    if (!selectedFlag) return;
    try {
      const updated = await api.updateFlag(selectedFlag.id, selectedFlag);
      setSelectedFlag(updated);
      triggerAlert('success', 'Flag configuration saved.');
      loadFlags();
      loadAuditLogs();
      setConfetti(true);
    } catch (e: any) {
      triggerAlert('error', e.message);
    }
  };

  const handleDeleteFlag = async (flagId: string) => {
    if (!confirm('Are you sure you want to delete this feature flag permanently? This cannot be undone.')) return;
    try {
      await api.deleteFlag(flagId);
      triggerAlert('success', 'Flag deleted.');
      if (selectedFlag && selectedFlag.id === flagId) {
        setSelectedFlag(null);
      }
      loadFlags();
      loadAuditLogs();
    } catch (e: any) {
      triggerAlert('error', e.message);
    }
  };

  const activeProject = projects.find(p => p.id === activeProjectId);

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!admin) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'radial-gradient(ellipse at bottom, #111827 0%, #030712 100%)', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '40px', animation: 'fadeIn 0.5s ease' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', width: '60px', height: '60px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 15px auto', boxShadow: 'var(--shadow-glow)' }}>
              <Flag size={32} color="var(--accent-primary)" className="pulse-glow" style={{ borderRadius: '50%' }} />
            </div>
            <h1 style={{ fontSize: '28px', fontFamily: 'var(--font-heading)', color: '#ffffff', letterSpacing: '-0.03em' }}>Antigravity Flag</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '5px' }}>Production-grade Feature Management Console</p>
          </div>

          {authError && (
            <div style={{ background: 'var(--color-danger-bg)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px 16px', borderRadius: '6px', color: '#fca5a5', fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={16} />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={signingUp ? handleSignup : handleLogin}>
            {signingUp && (
              <div className="input-group">
                <label className="input-label">Full Name</label>
                <input 
                  type="text" 
                  className="input-field" 
                  value={signupName} 
                  onChange={(e) => setSignupName(e.target.value)} 
                  placeholder="John Doe" 
                  required 
                />
              </div>
            )}
            
            <div className="input-group">
              <label className="input-label">Email Address</label>
              <input 
                type="email" 
                className="input-field" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="admin@example.com" 
                required 
              />
            </div>

            <div className="input-group" style={{ marginBottom: '25px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="input-label">Password</label>
              </div>
              <input 
                type="password" 
                className="input-field" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••" 
                required 
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '8px', fontSize: '15px' }}>
              {signingUp ? 'Create Administrator Account' : 'Log In to Console'}
            </button>
          </form>

          <div style={{ marginTop: '25px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
            {signingUp ? (
              <span>Already have an account? <a href="#" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: '500' }} onClick={(e) => { e.preventDefault(); setSigningUp(false); setAuthError(''); }}>Log In</a></span>
            ) : (
              <span>New team member? <a href="#" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: '500' }} onClick={(e) => { e.preventDefault(); setSigningUp(true); setAuthError(''); }}>Create an Account</a></span>
            )}
          </div>

          <div style={{ marginTop: '30px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--border-glass)', padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span style={{ fontWeight: '600', color: 'var(--text-secondary)' }}>Demo Account Details:</span><br/>
            Email: <code style={{ color: 'var(--accent-secondary)' }}>admin@example.com</code><br/>
            Password: <code style={{ color: 'var(--accent-secondary)' }}>admin123</code>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Alert Banner */}
      {alert && (
        <div style={{ 
          position: 'fixed', 
          top: '24px', 
          right: '24px', 
          zIndex: 9999, 
          background: alert.type === 'success' ? 'var(--color-success-bg)' : 'var(--color-danger-bg)', 
          border: `1px solid ${alert.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: alert.type === 'success' ? '#a7f3d0' : '#fca5a5', 
          padding: '16px 24px', 
          borderRadius: '10px', 
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          backdropFilter: 'blur(10px)',
          animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}>
          {alert.type === 'success' ? <Check size={18} color="var(--color-success)" /> : <ShieldAlert size={18} color="var(--color-danger)" />}
          <span style={{ fontWeight: 500, fontSize: '14px' }}>{alert.message}</span>
        </div>
      )}

      {/* Sidebar Navigation */}
      {/* Sidebar Navigation */}
      <div className="sidebar">
        {/* Brand */}
        <div id="brand-logo" style={{ padding: '30px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '8px', borderRadius: '10px', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
              <Flag size={20} color="var(--accent-primary)" />
            </div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em' }}>Antigravity</span>
          </div>
          <button 
            className="btn btn-secondary animate-pulse" 
            style={{ padding: '6px', borderRadius: '50%', minWidth: 'unset', border: 'none', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-secondary)' }}
            onClick={() => setTutorialStep(1)}
            title="Start Onboarding Tour"
          >
            <HelpCircle size={16} />
          </button>
        </div>

        {/* Navigation Items */}
        <div style={{ flex: 1, padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <button 
            id="sidebar-flags"
            className={`btn ${activeTab === 'flags' && !selectedFlag ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '12px 16px', borderRadius: '8px', border: 'none', background: (activeTab === 'flags' && !selectedFlag) ? 'linear-gradient(135deg, var(--accent-primary) 0%, #4f46e5 100%)' : 'transparent', color: (activeTab === 'flags' && !selectedFlag) ? '#fff' : 'var(--text-secondary)' }}
            onClick={() => { setActiveTab('flags'); setSelectedFlag(null); }}
          >
            <Layers size={18} />
            <span>Feature Flags</span>
          </button>
          
          <button 
            id="sidebar-simulator"
            className={`btn ${activeTab === 'simulator' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '12px 16px', borderRadius: '8px', border: 'none', background: activeTab === 'simulator' ? 'linear-gradient(135deg, var(--accent-primary) 0%, #4f46e5 100%)' : 'transparent', color: activeTab === 'simulator' ? '#fff' : 'var(--text-secondary)' }}
            onClick={() => { setActiveTab('simulator'); setSelectedFlag(null); }}
          >
            <Sparkles size={18} />
            <span>Live Simulator</span>
          </button>

          <button 
            className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '12px 16px', borderRadius: '8px', border: 'none', background: activeTab === 'audit' ? 'linear-gradient(135deg, var(--accent-primary) 0%, #4f46e5 100%)' : 'transparent', color: activeTab === 'audit' ? '#fff' : 'var(--text-secondary)' }}
            onClick={() => { setActiveTab('audit'); setSelectedFlag(null); }}
          >
            <History size={18} />
            <span>Audit History</span>
          </button>

          <button 
            id="sidebar-settings"
            className={`btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', padding: '12px 16px', borderRadius: '8px', border: 'none', background: activeTab === 'settings' ? 'linear-gradient(135deg, var(--accent-primary) 0%, #4f46e5 100%)' : 'transparent', color: activeTab === 'settings' ? '#fff' : 'var(--text-secondary)' }}
            onClick={() => { setActiveTab('settings'); setSelectedFlag(null); }}
          >
            <Settings size={18} />
            <span>Environment Keys</span>
          </button>
        </div>

        {/* User Card footer */}
        <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-glass)' }}>
                <User size={16} color="var(--text-secondary)" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{admin.name}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Administrator</span>
              </div>
            </div>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '6px', borderRadius: '6px', minWidth: 'unset', border: 'none', background: 'transparent' }} 
              onClick={handleLogout}
              title="Log Out"
            >
              <LogOut size={16} color="var(--color-danger)" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="main-content">
        
        {/* Workspace Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ fontSize: '24px', fontFamily: 'var(--font-heading)', letterSpacing: '-0.02em' }}>
                {activeProject ? activeProject.name : 'Console'}
              </h2>
              <button 
                onClick={() => setShowCreateProjModal(true)} 
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '6px' }}
              >
                <Plus size={12} /> New Project
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
              Project ID: <code style={{ color: 'var(--accent-secondary)' }}>{activeProjectId}</code>
            </p>
          </div>

          <div id="project-selector-container" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <label className="input-label" style={{ margin: 0, fontSize: '12px' }}>Active Project</label>
            <select 
              className="select-field"
              style={{ padding: '8px 36px 8px 12px', fontSize: '13px', backgroundPosition: 'right 8px center' }}
              value={activeProjectId}
              onChange={(e) => setActiveProjectId(e.target.value)}
            >
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ----------------- PROJECTS CREATION MODAL ----------------- */}
        {showCreateProjModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
            <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '30px', animation: 'fadeIn 0.2s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px' }}>Create New Project</h3>
                <button onClick={() => setShowCreateProjModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
              </div>
              <form onSubmit={handleCreateProject}>
                <div className="input-group" style={{ marginBottom: '24px' }}>
                  <label className="input-label">Project Name</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="E.g. Mobile Apps Core"
                    value={newProjName}
                    onChange={(e) => setNewProjName(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setShowCreateProjModal(false)} className="btn btn-secondary">Cancel</button>
                  <button type="submit" className="btn btn-primary">Create Project</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ----------------- VIEW: SINGLE FLAG DETAILS EDITOR ----------------- */}
        {selectedFlag ? (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* Detail Navigation header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <a href="#" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500, fontSize: '14px' }} onClick={(e) => { e.preventDefault(); setSelectedFlag(null); }}>Flags</a>
                <ChevronRight size={14} color="var(--text-muted)" />
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{selectedFlag.key}</span>
              </div>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setSelectedFlag(null)} className="btn btn-secondary">Cancel</button>
                <button onClick={handleSaveFlagDetails} className="btn btn-primary" style={{ minWidth: '110px' }}>
                  <Save size={16} /> Save Changes
                </button>
              </div>
            </div>

            {/* Flag Header Info */}
            <div className="glass-panel" style={{ padding: '30px', display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ background: selectedFlag.isKilled ? 'var(--color-danger-bg)' : 'var(--color-success-bg)', padding: '12px', borderRadius: '12px', border: `1px solid ${selectedFlag.isKilled ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}` }}>
                  <Flag size={24} color={selectedFlag.isKilled ? 'var(--color-danger)' : 'var(--color-success)'} />
                </div>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 600 }}>{selectedFlag.name}</h3>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '6px', fontSize: '13px' }}>
                    <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'var(--accent-secondary)' }}>{selectedFlag.key}</code>
                    <span style={{ color: 'var(--text-muted)' }}>|</span>
                    <span className="badge badge-info" style={{ padding: '2px 8px', fontSize: '10px' }}>{selectedFlag.type}</span>
                  </div>
                </div>
              </div>

              {/* Top Level Overrides: Kill Switch */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(0,0,0,0.15)', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
                <div>
                  <h4 style={{ fontSize: '14px', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldAlert size={14} color="var(--color-danger)" /> Emergency Kill Switch
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Instantly bypass all rules, returning defaults.</p>
                </div>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={selectedFlag.isKilled}
                    onChange={(e) => {
                      setSelectedFlag({ ...selectedFlag, isKilled: e.target.checked });
                    }}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            {/* Split layout: Environment Targeting Configuration & Details Panel */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '30px', alignItems: 'start' }}>
              
              {/* Left Panel: Environment configurations */}
              <div className="glass-panel" style={{ padding: '30px' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-glass)', marginBottom: '24px' }}>
                  {(['dev', 'staging', 'prod'] as const).map(env => (
                    <button 
                      key={env}
                      className="btn"
                      style={{ 
                        background: 'transparent',
                        color: selectedEnv === env ? 'var(--accent-primary)' : 'var(--text-muted)',
                        borderBottom: selectedEnv === env ? '2px solid var(--accent-primary)' : '2px solid transparent',
                        borderRadius: 0,
                        padding: '12px 24px',
                        fontSize: '15px',
                        fontWeight: selectedEnv === env ? 600 : 500
                      }}
                      onClick={() => setSelectedEnv(env)}
                    >
                      {env.toUpperCase()} Environment
                      {selectedFlag.environments[env]?.enabled ? (
                        <span style={{ width: '6px', height: '6px', background: 'var(--color-success)', borderRadius: '50%', marginLeft: '6px' }}></span>
                      ) : null}
                    </button>
                  ))}
                </div>

                {/* Env Settings Panel */}
                {selectedFlag.environments[selectedEnv] ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                    
                    {/* Toggle Switch to Enable Flag in Env */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '16px 20px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: '15px' }}>Targeting Status</span>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>Activate rules and rollouts in this environment.</p>
                      </div>
                      <label className="switch">
                        <input 
                          type="checkbox"
                          checked={selectedFlag.environments[selectedEnv].enabled}
                          onChange={(e) => {
                            const next = { ...selectedFlag };
                            next.environments[selectedEnv].enabled = e.target.checked;
                            setSelectedFlag(next);
                          }}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>

                    {/* Default Variant Fallback */}
                    <div className="input-group" style={{ margin: 0 }}>
                      <label className="input-label">Default Fallback Variant</label>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Served if no rules match or flag is disabled / killed.</span>
                      <select 
                        className="select-field"
                        value={selectedFlag.environments[selectedEnv].defaultVariant}
                        onChange={(e) => {
                          const next = { ...selectedFlag };
                          next.environments[selectedEnv].defaultVariant = e.target.value;
                          setSelectedFlag(next);
                        }}
                      >
                        {selectedFlag.variants.map((v: any) => (
                          <option key={v.id} value={v.name}>{v.name} ({JSON.stringify(v.value)})</option>
                        ))}
                      </select>
                    </div>

                    {/* Rule Targeting Section */}
                    <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '24px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div>
                          <h4 style={{ fontSize: '16px', fontWeight: 600 }}>Targeting Rules</h4>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Rules are evaluated top-to-bottom. First matching rule wins.</span>
                        </div>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => {
                            const next = { ...selectedFlag };
                            const rules = next.environments[selectedEnv].rules;
                            const priority = rules.length;
                            rules.push({
                              id: `rule-${uuid()}`,
                              flagEnvironmentId: next.environments[selectedEnv].id,
                              priority,
                              attribute: 'userId',
                              operator: 'eq',
                              value: '',
                              variant: next.variants[0].name
                            });
                            setSelectedFlag(next);
                          }}
                        >
                          <Plus size={14} /> Add Rule
                        </button>
                      </div>

                      {selectedFlag.environments[selectedEnv].rules.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '30px', border: '1px dashed var(--border-glass)', borderRadius: '8px', color: 'var(--text-muted)' }}>
                          <Sliders size={24} style={{ marginBottom: '10px', opacity: 0.5 }} />
                          <p style={{ fontSize: '13px' }}>No rules configured. All users receive the default fallback variant.</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {selectedFlag.environments[selectedEnv].rules.map((rule: any, index: number) => (
                            <div 
                              key={rule.id}
                              className="glass-card"
                              style={{ 
                                display: 'flex', 
                                gap: '12px', 
                                alignItems: 'center', 
                                flexWrap: 'wrap', 
                                padding: '16px',
                                borderLeft: '3px solid var(--accent-primary)'
                              }}
                            >
                              {/* Index / Grab badge */}
                              <div style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                                #{index + 1}
                              </div>

                              {/* Attribute field */}
                              <select 
                                className="select-field" 
                                style={{ padding: '6px 28px 6px 10px', fontSize: '13px', backgroundPosition: 'right 6px center', minWidth: '110px' }}
                                value={rule.attribute}
                                onChange={(e) => {
                                  const next = { ...selectedFlag };
                                  next.environments[selectedEnv].rules[index].attribute = e.target.value;
                                  setSelectedFlag(next);
                                }}
                              >
                                <option value="userId">userId</option>
                                <option value="email">email</option>
                                <option value="plan">plan</option>
                                <option value="country">country</option>
                                <option value="custom">custom field</option>
                              </select>

                              {rule.attribute === 'custom' && (
                                <input 
                                  type="text" 
                                  className="input-field" 
                                  placeholder="customAttrKey"
                                  style={{ padding: '6px 10px', fontSize: '13px', width: '110px' }}
                                  value={rule.customAttribute || ''}
                                  onChange={(e) => {
                                    const next = { ...selectedFlag };
                                    next.environments[selectedEnv].rules[index].attribute = e.target.value;
                                    next.environments[selectedEnv].rules[index].customAttribute = e.target.value;
                                    setSelectedFlag(next);
                                  }}
                                />
                              )}

                              {/* Operator selection */}
                              <select 
                                className="select-field" 
                                style={{ padding: '6px 28px 6px 10px', fontSize: '13px', backgroundPosition: 'right 6px center', minWidth: '90px' }}
                                value={rule.operator}
                                onChange={(e) => {
                                  const next = { ...selectedFlag };
                                  next.environments[selectedEnv].rules[index].operator = e.target.value;
                                  setSelectedFlag(next);
                                }}
                              >
                                <option value="eq">is equal to (eq)</option>
                                <option value="neq">is not equal to (neq)</option>
                                <option value="in">is in list (in)</option>
                                <option value="contains">contains (like)</option>
                                <option value="gt">is greater than (gt)</option>
                                <option value="lt">is less than (lt)</option>
                              </select>

                              {/* Target Value matcher */}
                              <input 
                                type="text" 
                                className="input-field" 
                                placeholder={rule.operator === 'in' ? 'user1, user2, user3' : 'Value to match'}
                                style={{ padding: '6px 12px', fontSize: '13px', flex: 1, minWidth: '150px' }}
                                value={rule.value}
                                onChange={(e) => {
                                  const next = { ...selectedFlag };
                                  next.environments[selectedEnv].rules[index].value = e.target.value;
                                  setSelectedFlag(next);
                                }}
                              />

                              <ChevronRight size={16} color="var(--text-muted)" />

                              {/* Serve variant select */}
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>serve</span>
                                <select 
                                  className="select-field" 
                                  style={{ padding: '6px 28px 6px 10px', fontSize: '13px', backgroundPosition: 'right 6px center' }}
                                  value={rule.variant}
                                  onChange={(e) => {
                                    const next = { ...selectedFlag };
                                    next.environments[selectedEnv].rules[index].variant = e.target.value;
                                    setSelectedFlag(next);
                                  }}
                                >
                                  {selectedFlag.variants.map((v: any) => (
                                    <option key={v.id} value={v.name}>{v.name}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Delete Rule */}
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '6px', border: 'none', background: 'transparent' }}
                                onClick={() => {
                                  const next = { ...selectedFlag };
                                  next.environments[selectedEnv].rules.splice(index, 1);
                                  // Re-align priority indexes
                                  next.environments[selectedEnv].rules = next.environments[selectedEnv].rules.map((r: any, idx: number) => ({ ...r, priority: idx }));
                                  setSelectedFlag(next);
                                }}
                              >
                                <Trash2 size={16} color="var(--color-danger)" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Percentage Rollout weights (Optional) */}
                    <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '24px' }}>
                      <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Percentage Rollout (Default Rule)</h4>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>If no targeting rules match, distribute users based on these weights.</span>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                        
                        {/* Option Toggle */}
                        <div style={{ display: 'flex', gap: '20px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                            <input 
                              type="radio" 
                              name="rolloutMode" 
                              checked={!selectedFlag.environments[selectedEnv].rolloutWeights}
                              onChange={() => {
                                const next = { ...selectedFlag };
                                next.environments[selectedEnv].rolloutWeights = undefined;
                                next.environments[selectedEnv].rolloutPercentage = undefined;
                                setSelectedFlag(next);
                              }}
                            />
                            Standard Fallback (Serve fallback variant to 100%)
                          </label>

                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                            <input 
                              type="radio" 
                              name="rolloutMode"
                              checked={!!selectedFlag.environments[selectedEnv].rolloutWeights}
                              onChange={() => {
                                const next = { ...selectedFlag };
                                const weights: Record<string, number> = {};
                                const count = next.variants.length;
                                const equalWeight = Math.floor(100 / count);
                                next.variants.forEach((v: any, idx: number) => {
                                  weights[v.name] = idx === count - 1 ? 100 - (equalWeight * (count - 1)) : equalWeight;
                                });
                                next.environments[selectedEnv].rolloutWeights = weights;
                                setSelectedFlag(next);
                              }}
                            />
                            Weighted Rollout (Multi-variant percentage splits)
                          </label>
                        </div>

                        {selectedFlag.environments[selectedEnv].rolloutWeights && (
                          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {selectedFlag.variants.map((v: any) => {
                              const weights = selectedFlag.environments[selectedEnv].rolloutWeights || {};
                              const currentWeight = weights[v.name] || 0;
                              return (
                                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                  <span style={{ width: '100px', fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</span>
                                  <input 
                                    type="range" 
                                    min="0" 
                                    max="100" 
                                    style={{ flex: 1, accentColor: 'var(--accent-primary)', height: '4px' }}
                                    value={currentWeight}
                                    onChange={(e) => {
                                      const next = { ...selectedFlag };
                                      const nextWeights = { ...(next.environments[selectedEnv].rolloutWeights || {}) };
                                      nextWeights[v.name] = parseInt(e.target.value, 10);
                                      next.environments[selectedEnv].rolloutWeights = nextWeights;
                                      setSelectedFlag(next);
                                    }}
                                  />
                                  <div style={{ width: '60px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <input 
                                      type="number"
                                      min="0"
                                      max="100"
                                      className="input-field"
                                      style={{ padding: '4px 6px', fontSize: '13px', textAlign: 'center', width: '45px' }}
                                      value={currentWeight}
                                      onChange={(e) => {
                                        const next = { ...selectedFlag };
                                        const nextWeights = { ...(next.environments[selectedEnv].rolloutWeights || {}) };
                                        nextWeights[v.name] = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
                                        next.environments[selectedEnv].rolloutWeights = nextWeights;
                                        setSelectedFlag(next);
                                      }}
                                    />
                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>%</span>
                                  </div>
                                </div>
                              );
                            })}
                            
                            {/* Total warning check */}
                            {(() => {
                              const weights = selectedFlag.environments[selectedEnv].rolloutWeights || {};
                              const total = Object.values(weights).reduce((a: any, b: any) => a + b, 0);
                              return (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '12px' }}>
                                  <span style={{ color: total === 100 ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 600 }}>
                                    Total Weights: {total}% {total === 100 ? '✓' : '⚠️'}
                                  </span>
                                  {total !== 100 && (
                                    <span style={{ color: 'var(--text-muted)' }}>Weights must sum to exactly 100%.</span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                      </div>
                    </div>

                  </div>
                ) : (
                  <div>No env settings available</div>
                )}
              </div>

              {/* Right Panel: Variants & Evaluation Stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                
                {/* Variants List Box */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>Flag Variants</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {selectedFlag.variants.map((v: any) => (
                      <div key={v.id} style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-secondary)' }}>{v.name}</span>
                        <div style={{ marginTop: '4px' }}>
                          <code style={{ fontSize: '12px', color: 'var(--text-secondary)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>{JSON.stringify(v.value)}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Evaluation Analytics Box */}
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Activity size={16} color="var(--accent-secondary)" /> Evaluation Analytics
                  </h4>
                  
                  {flagStats && flagStats[selectedEnv] && Object.keys(flagStats[selectedEnv]).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Variant evaluations over the last 7 days:</span>
                      {Object.entries(flagStats[selectedEnv]).map(([variantName, count]: any) => (
                        <div key={variantName}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 500 }}>{variantName}</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{count} views</span>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div 
                              style={{ 
                                height: '100%', 
                                background: 'var(--accent-secondary)', 
                                width: `${Math.min(100, (count / Object.values(flagStats[selectedEnv]).reduce((a: any, b: any) => a + b, 0) as number) * 100)}%` 
                              }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
                      <p style={{ fontSize: '12px' }}>No evaluation exposure logged for {selectedEnv.toUpperCase()} yet.</p>
                      <span style={{ fontSize: '11px', display: 'block', marginTop: '5px' }}>Connect SDK key to start tracking A/B stats.</span>
                    </div>
                  )}
                </div>

                {/* Operations Box */}
                <div className="glass-panel" style={{ padding: '24px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                  <h4 style={{ fontSize: '16px', fontWeight: 600, color: '#fca5a5', marginBottom: '10px' }}>Danger Zone</h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>Permanently remove this flag. Any SDK evaluations will immediately fall back.</p>
                  <button 
                    onClick={() => handleDeleteFlag(selectedFlag.id)}
                    className="btn btn-danger"
                    style={{ width: '100%', display: 'flex', gap: '8px', justifyContent: 'center' }}
                  >
                    <Trash2 size={16} /> Delete Feature Flag
                  </button>
                </div>

              </div>

            </div>

          </div>
        ) : activeTab === 'flags' ? (
          
          /* ----------------- TAB: FLAGS LIST ----------------- */
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Search & Actions Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type="text" 
                  className="input-field" 
                  style={{ paddingLeft: '44px', width: '100%' }}
                  placeholder="Search flags by name or key..."
                  // we can implement a simple client filter later
                />
              </div>

              <button 
                id="create-flag-btn"
                onClick={() => setShowCreateFlagModal(true)} 
                className="btn btn-primary"
                style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
              >
                <Plus size={16} /> Create Flag
              </button>
            </div>

            {/* Flags Table */}
            {flags.length === 0 ? (
              <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--text-secondary)' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto', border: '1px solid var(--border-glass)' }}>
                  <Flag size={28} color="var(--text-muted)" />
                </div>
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>No Feature Flags Found</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto 20px auto' }}>Create a flag to start rolling out variants to users and running A/B testing trials.</p>
                <button onClick={() => setShowCreateFlagModal(true)} className="btn btn-primary"><Plus size={16} /> Create First Flag</button>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Flag Details</th>
                      <th>Type</th>
                      <th>Dev</th>
                      <th>Staging</th>
                      <th>Prod</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flags.map((flag: any) => (
                      <tr key={flag.id}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span 
                              style={{ fontWeight: 600, color: '#ffffff', cursor: 'pointer' }}
                              onClick={() => setSelectedFlag(flag)}
                            >
                              {flag.name}
                            </span>
                            <code style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{flag.key}</code>
                          </div>
                        </td>
                        <td>
                          <span className="badge badge-info" style={{ fontSize: '10px' }}>{flag.type}</span>
                        </td>
                        <td>
                          <span className={`badge ${flag.environments.dev?.enabled ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                            {flag.environments.dev?.enabled ? 'ON' : 'OFF'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${flag.environments.staging?.enabled ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                            {flag.environments.staging?.enabled ? 'ON' : 'OFF'}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${flag.environments.prod?.enabled ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '9px', padding: '2px 6px' }}>
                            {flag.environments.prod?.enabled ? 'ON' : 'OFF'}
                          </span>
                        </td>
                        <td>
                          {flag.isKilled ? (
                            <span className="badge badge-danger" style={{ fontSize: '9px', padding: '2px 6px' }}>KILLED</span>
                          ) : (
                            <span className="badge badge-success" style={{ fontSize: '9px', padding: '2px 6px', background: 'rgba(16, 185, 129, 0.05)', color: 'var(--color-success)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>ACTIVE</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '6px 12px', fontSize: '12px' }}
                              onClick={() => setSelectedFlag(flag)}
                            >
                              Configure
                            </button>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '6px', border: 'none', background: 'transparent' }}
                              onClick={() => handleDeleteFlag(flag.id)}
                            >
                              <Trash2 size={15} color="var(--color-danger)" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ----------------- CREATE FLAG MODAL ----------------- */}
            {showCreateFlagModal && (
              <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
                <div className="glass-panel" style={{ width: '100%', maxWidth: '500px', padding: '30px', maxHeight: '90vh', overflowY: 'auto', animation: 'fadeIn 0.2s ease' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Create Feature Flag</h3>
                    <button onClick={() => setShowCreateFlagModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
                  </div>
                  
                  <form onSubmit={handleCreateFlag}>
                    <div className="input-group">
                      <label className="input-label">Flag Name</label>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="E.g. Beta Signup Flow"
                        value={newFlagName}
                        onChange={(e) => {
                          setNewFlagName(e.target.value);
                          // Auto generate key slug
                          setNewFlagKey(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
                        }}
                        required
                      />
                    </div>

                    <div className="input-group">
                      <label className="input-label">Flag Key (Key used in code)</label>
                      <input 
                        type="text" 
                        className="input-field" 
                        placeholder="e.g. beta-signup-flow"
                        value={newFlagKey}
                        onChange={(e) => setNewFlagKey(e.target.value)}
                        required
                      />
                    </div>

                    <div className="input-group">
                      <label className="input-label">Flag Variant Type</label>
                      <select 
                        className="select-field"
                        value={newFlagType}
                        onChange={(e) => handleFlagTypeChange(e.target.value as any)}
                      >
                        <option value="bool">Boolean (true / false)</option>
                        <option value="string">String (Text variant values)</option>
                        <option value="number">Number (Numeric variant values)</option>
                        <option value="json">JSON (Structured objects)</option>
                      </select>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-glass)', marginTop: '20px', paddingTop: '16px', marginBottom: '24px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Variants Definition</span>
                        {newFlagType !== 'bool' && (
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={addVariantField}
                          >
                            Add Variant
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {newFlagVariants.map((v, index) => (
                          <div key={index} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input 
                              type="text" 
                              className="input-field" 
                              style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }} 
                              placeholder="Variant Name"
                              value={v.name}
                              onChange={(e) => updateVariantValue(index, 'name', e.target.value)}
                              disabled={newFlagType === 'bool'}
                              required
                            />
                            <input 
                              type="text" 
                              className="input-field" 
                              style={{ flex: 1.5, padding: '8px 12px', fontSize: '13px' }} 
                              placeholder="Value (e.g. true or a string)"
                              value={newFlagType === 'json' ? (typeof v.value === 'object' ? JSON.stringify(v.value) : v.value) : String(v.value)}
                              onChange={(e) => updateVariantValue(index, 'value', e.target.value)}
                              disabled={newFlagType === 'bool'}
                              required
                            />
                            {newFlagType !== 'bool' && newFlagVariants.length > 1 && (
                              <button 
                                type="button" 
                                className="btn btn-secondary" 
                                style={{ padding: '8px', border: 'none', background: 'transparent' }}
                                onClick={() => removeVariantField(index)}
                              >
                                <Trash2 size={16} color="var(--color-danger)" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={() => setShowCreateFlagModal(false)} className="btn btn-secondary">Cancel</button>
                      <button type="submit" className="btn btn-primary">Create Flag</button>
                    </div>
                  </form>
                </div>
              </div>
            )}

          </div>
        ) : activeTab === 'audit' ? (
          
          /* ----------------- TAB: AUDIT LOGS ----------------- */
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>Audit log history</h3>
            
            {auditLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                <History size={32} style={{ marginBottom: '10px', opacity: 0.5 }} />
                <p style={{ fontSize: '13px' }}>No audit history records found for this project.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {auditLogs.map((log: any) => (
                  <div key={log.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className={`badge ${
                          log.action === 'CREATE' ? 'badge-success' : 
                          log.action === 'UPDATE' ? 'badge-info' : 
                          log.action === 'KILL' ? 'badge-danger' : 'badge-warning'
                        }`} style={{ padding: '3px 8px', fontSize: '9px' }}>
                          {log.action}
                        </span>

                        <span style={{ fontWeight: 600, fontSize: '14px' }}>
                          FlagKey: <code style={{ color: 'var(--accent-secondary)', background: 'rgba(255,255,255,0.03)', padding: '2px 4px', borderRadius: '4px' }}>{log.flagKey}</code>
                        </span>
                      </div>

                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Logged by <span style={{ color: '#ffffff', fontWeight: 500 }}>{log.actorName}</span> • {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </div>

                    {/* Diff Snapshot Details */}
                    {log.beforeSnapshot || log.afterSnapshot ? (
                      <details style={{ marginTop: '8px' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--accent-primary)', outline: 'none', fontWeight: 500 }}>
                          View Changes details (JSON snapshot)
                        </summary>
                        <div style={{ display: 'grid', gridTemplateColumns: log.beforeSnapshot && log.afterSnapshot ? '1fr 1fr' : '1fr', gap: '16px', marginTop: '12px' }}>
                          {log.beforeSnapshot && (
                            <div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Before</span>
                              <pre style={{ background: '#0a0d14', border: '1px solid var(--border-glass)', padding: '12px', borderRadius: '6px', fontSize: '11px', overflowX: 'auto', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                                {JSON.stringify(log.beforeSnapshot, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.afterSnapshot && (
                            <div>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>After</span>
                              <pre style={{ background: '#0a0d14', border: '1px solid var(--border-glass)', padding: '12px', borderRadius: '6px', fontSize: '11px', overflowX: 'auto', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                                {JSON.stringify(log.afterSnapshot, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

        ) : activeTab === 'simulator' ? (
          
          /* ----------------- TAB: LIVE SIMULATION PLAYGROUND ----------------- */
          <div className="tab-transition animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 600 }}>Simulation Studio</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                  Simulate real-time evaluations of feature flags against custom user profiles locally using the deterministic SDK client engine.
                </p>
              </div>

              <button 
                onClick={handleBootstrapDemoFlags}
                className="btn btn-primary"
                style={{ background: 'linear-gradient(135deg, var(--accent-secondary) 0%, #0891b2 100%)', boxShadow: '0 0 15px rgba(6, 182, 212, 0.2)' }}
              >
                <Sparkles size={14} /> Setup Simulator Demo Flags
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '30px', alignItems: 'start' }}>
              
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h4 style={{ fontSize: '15px', fontWeight: 600, borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sliders size={16} color="var(--accent-primary)" /> Target User Context
                </h4>

                <div className="input-group">
                  <label className="input-label" style={{ fontSize: '11px' }}>Environment</label>
                  <select 
                    className="select-field"
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                    value={simulationEnv}
                    onChange={(e) => setSimulationEnv(e.target.value as any)}
                  >
                    <option value="dev">DEV</option>
                    <option value="staging">STAGING</option>
                    <option value="prod">PROD</option>
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label" style={{ fontSize: '11px' }}>User ID (Rollout Identifier)</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                    value={simulatorUser.userId}
                    onChange={(e) => setSimulatorUser({ ...simulatorUser, userId: e.target.value })}
                    placeholder="user-123"
                  />
                </div>

                <div className="input-group">
                  <label className="input-label" style={{ fontSize: '11px' }}>Email Address</label>
                  <input 
                    type="email" 
                    className="input-field" 
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                    value={simulatorUser.email}
                    onChange={(e) => setSimulatorUser({ ...simulatorUser, email: e.target.value })}
                    placeholder="user@example.com"
                  />
                </div>

                <div className="input-group">
                  <label className="input-label" style={{ fontSize: '11px' }}>Plan Tier</label>
                  <select 
                    className="select-field"
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                    value={simulatorUser.plan}
                    onChange={(e) => setSimulatorUser({ ...simulatorUser, plan: e.target.value })}
                  >
                    <option value="free">Free</option>
                    <option value="premium">Premium</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>

                <div className="input-group">
                  <label className="input-label" style={{ fontSize: '11px' }}>Country Code</label>
                  <select 
                    className="select-field"
                    style={{ padding: '8px 12px', fontSize: '13px' }}
                    value={simulatorUser.country}
                    onChange={(e) => setSimulatorUser({ ...simulatorUser, country: e.target.value })}
                  >
                    <option value="US">United States (US)</option>
                    <option value="CA">Canada (CA)</option>
                    <option value="GB">United Kingdom (GB)</option>
                    <option value="DE">Germany (DE)</option>
                    <option value="JP">Japan (JP)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label className="input-label" style={{ fontSize: '11px' }}>Custom Attributes</label>
                  {customAttrs.map((attr, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input 
                        type="text" 
                        className="input-field" 
                        style={{ padding: '6px 8px', fontSize: '12px', flex: 1 }}
                        placeholder="Key (e.g. device)"
                        value={attr.key}
                        onChange={(e) => {
                          const next = [...customAttrs];
                          next[idx].key = e.target.value;
                          setCustomAttrs(next);
                        }}
                      />
                      <input 
                        type="text" 
                        className="input-field" 
                        style={{ padding: '6px 8px', fontSize: '12px', flex: 1 }}
                        placeholder="Value (e.g. mobile)"
                        value={attr.val}
                        onChange={(e) => {
                          const next = [...customAttrs];
                          next[idx].val = e.target.value;
                          setCustomAttrs(next);
                        }}
                      />
                      <button 
                        onClick={() => {
                          const next = [...customAttrs];
                          next.splice(idx, 1);
                          setCustomAttrs(next);
                        }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                      >
                        <X size={14} color="var(--color-danger)" />
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={() => setCustomAttrs([...customAttrs, { key: '', val: '' }])}
                    className="btn btn-secondary" 
                    style={{ padding: '6px 12px', fontSize: '12px', justifyContent: 'center', marginTop: '4px' }}
                  >
                    <Plus size={12} /> Add Custom Attribute
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span className="input-label" style={{ fontSize: '11px' }}>Client App Preview</span>
                  
                  <div style={{
                    background: simResults['dark-mode-preview']?.value ? '#090e17' : '#ffffff',
                    color: simResults['dark-mode-preview']?.value ? '#f3f4f6' : '#1f2937',
                    border: simResults['dark-mode-preview']?.value ? '1px solid rgba(0, 240, 255, 0.2)' : '1px solid #e5e7eb',
                    boxShadow: simResults['dark-mode-preview']?.value ? '0 0 25px rgba(6, 182, 212, 0.15)' : 'var(--shadow-md)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    transition: 'all 0.4s ease',
                    minHeight: '260px',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <div style={{ 
                      background: simResults['dark-mode-preview']?.value ? '#111b2d' : '#f3f4f6', 
                      borderBottom: simResults['dark-mode-preview']?.value ? '1px solid rgba(255,255,255,0.05)' : '1px solid #e5e7eb',
                      padding: '10px 16px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px' 
                    }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></span>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }}></span>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></span>
                      </div>
                      <div style={{ 
                        flex: 1, 
                        background: simResults['dark-mode-preview']?.value ? 'rgba(0,0,0,0.2)' : '#ffffff', 
                        fontSize: '11px', 
                        color: simResults['dark-mode-preview']?.value ? '#94a3b8' : '#6b7280', 
                        textAlign: 'center', 
                        borderRadius: '4px',
                        padding: '3px',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        https://antigravity-preview.io/dashboard?user={simulatorUser.userId}
                      </div>
                    </div>

                    {simResults['show-beta-banner']?.value && (
                      <div className="mock-promo-banner" style={{ borderRadius: 0 }}>
                        ✨ WELCOME TO ANTIGRAVITY PORTAL BETA! Rushing edge performance is live.
                      </div>
                    )}

                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ 
                          fontSize: '16px', 
                          fontWeight: 700, 
                          color: simResults['dark-mode-preview']?.value ? '#00f0ff' : '#4f46e5',
                          textShadow: simResults['dark-mode-preview']?.value ? '0 0 10px rgba(0, 240, 255, 0.4)' : 'none',
                          margin: 0
                        }}>
                          🪐 Antigravity Portal
                        </h4>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ 
                            fontSize: '11px', 
                            padding: '2px 8px', 
                            borderRadius: '4px', 
                            background: simResults['dark-mode-preview']?.value ? 'rgba(0, 240, 255, 0.1)' : '#e0e7ff',
                            color: simResults['dark-mode-preview']?.value ? '#00f0ff' : '#4f46e5',
                            fontWeight: 600
                          }}>
                            {simulatorUser.plan.toUpperCase()} TIER
                          </span>
                        </div>
                      </div>

                      <div className={`cyber-card ${simResults['new-checkout-flow']?.value === 'v2-modern' ? 'cyber-card-glow' : ''}`} style={{
                        background: simResults['dark-mode-preview']?.value ? 'rgba(30, 41, 59, 0.3)' : '#f9fafb',
                        border: simResults['new-checkout-flow']?.value === 'v2-modern' 
                          ? (simResults['dark-mode-preview']?.value ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid #6366f1') 
                          : '1px solid rgba(0,0,0,0.06)',
                        padding: '20px',
                        borderRadius: '12px',
                        transition: 'all 0.3s ease'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
                          <div style={{ textAlign: 'left' }}>
                            <h5 style={{ 
                              fontSize: '14px', 
                              fontWeight: 600, 
                              color: simResults['dark-mode-preview']?.value ? '#ffffff' : '#111827',
                              margin: 0
                            }}>
                              Antigravity Cloud Core License
                            </h5>
                            <span style={{ fontSize: '11px', color: '#888' }}>Includes SDK evaluations & sub-5ms targeting.</span>
                          </div>
                          
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {(simResults['pricing-discount-tier']?.value === 'standard' || simResults['pricing-discount-tier']?.value === 'vip') && (
                                <span style={{ fontSize: '11px', textDecoration: 'line-through', color: '#9ca3af' }}>$49/mo</span>
                              )}
                              <span style={{ 
                                fontSize: '18px', 
                                fontWeight: 700, 
                                color: simResults['dark-mode-preview']?.value ? '#00f0ff' : '#111827' 
                              }}>
                                ${simResults['pricing-discount-tier']?.value === 'vip' ? '36.75' : simResults['pricing-discount-tier']?.value === 'standard' ? '44.10' : '49.00'}
                              </span>
                            </div>
                            {simResults['pricing-discount-tier']?.value && simResults['pricing-discount-tier']?.value !== 'none' && (
                              <span style={{ 
                                fontSize: '10px', 
                                padding: '2px 4px', 
                                borderRadius: '3px', 
                                background: '#10b981', 
                                color: '#ffffff', 
                                fontWeight: 600,
                                display: 'inline-block',
                                marginTop: '2px'
                              }}>
                                {simResults['pricing-discount-tier']?.value === 'vip' ? 'VIP 25% OFF' : 'STANDARD 10% OFF'}
                              </span>
                            )}
                          </div>
                        </div>

                        {simResults['new-checkout-flow']?.value === 'v2-modern' ? (
                          <button 
                            className="btn" 
                            style={{ 
                              width: '100%', 
                              padding: '10px', 
                              borderRadius: '8px', 
                              background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)', 
                              color: '#ffffff', 
                              fontWeight: 600,
                              boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)',
                              border: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            🚀 Proceed to Cyber Checkout
                          </button>
                        ) : (
                          <button 
                            className="btn" 
                            style={{ 
                              width: '100%', 
                              padding: '10px', 
                              borderRadius: '6px', 
                              background: '#374151', 
                              color: '#d1d5db', 
                              border: 'none',
                              fontWeight: 500
                            }}
                          >
                            Checkout Standard
                          </button>
                        )}
                      </div>

                      {(!hasSimulatorFlags || flags.length === 0) && (
                        <div style={{ 
                          background: 'rgba(245, 158, 11, 0.08)', 
                          border: '1px dashed rgba(245, 158, 11, 0.3)',
                          padding: '12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#fbbf24',
                          textAlign: 'left'
                        }}>
                          💡 <strong>Notice:</strong> Simulation flags are missing in this project. Click <strong>"Setup Simulator Demo Flags"</strong> above to auto-create them and experience full real-time mock changes!
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span className="input-label" style={{ fontSize: '11px' }}>SDK Local Evaluation Logger</span>
                  <div className="terminal-logs">
                    {simulatorLogs.length === 0 ? (
                      <div style={{ color: '#475569', textAlign: 'center', paddingTop: '60px' }}>No logs yet. Try modifying the User Context attributes on the left.</div>
                    ) : (
                      simulatorLogs.map((log, idx) => (
                        <div key={idx} className={`terminal-line ${log.type}`}>
                          <span style={{ color: '#475569', marginRight: '8px' }}>[{log.timestamp}]</span>
                          {log.text}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span className="input-label" style={{ fontSize: '11px' }}>Quick-Start SDK Integration code</span>
                  <div className="snippet-container">
                    <span style={{ color: '#6366f1' }}>import</span> {'{ FeatureFlagClient }'} <span style={{ color: '#6366f1' }}>from</span> <span style={{ color: '#06b6d4' }}>'@antigravity-sdk/client'</span>;<br/>
                    <br/>
                    <span style={{ color: '#6b7280' }}>// Initialize real-time streaming SDK client</span><br/>
                    <span style={{ color: '#6366f1' }}>const</span> client = <span style={{ color: '#6366f1' }}>new</span> <span style={{ color: '#f59e0b' }}>FeatureFlagClient</span>(<span style={{ color: '#a7f3d0' }}>'{activeProject?.environments[simulationEnv]?.sdkKey || 'YOUR_SDK_KEY'}'</span>, {'{'} enableStream: <span style={{ color: '#f59e0b' }}>true</span> {'}'});<br/>
                    <span style={{ color: '#6366f1' }}>await</span> client.initialize();<br/>
                    <br/>
                    <span style={{ color: '#6b7280' }}>// Evaluate flags locally based on user context</span><br/>
                    <span style={{ color: '#6366f1' }}>const</span> showBanner = client.evaluate(<span style={{ color: '#a7f3d0' }}>'show-beta-banner'</span>, userContext, <span style={{ color: '#f59e0b' }}>false</span>);
                  </div>
                </div>

              </div>

            </div>
          </div>

        ) : (
          
          /* ----------------- TAB: ENVIRONMENT KEYS & SETTINGS ----------------- */
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <div className="glass-panel" style={{ padding: '30px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, borderBottom: '1px solid var(--border-glass)', paddingBottom: '15px', marginBottom: '20px' }}>SDK & Client Keys</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                Use these environment-specific keys to initialize the client SDK in your application. Never share these keys on public source repositories.
              </p>

              {activeProject ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {(['dev', 'staging', 'prod'] as const).map(env => {
                    const envData = activeProject.environments[env];
                    if (!envData) return null;

                    return (
                      <div 
                        key={env} 
                        className="glass-card"
                        style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: '12px',
                          borderLeft: `3px solid ${
                            env === 'dev' ? 'var(--color-info)' : 
                            env === 'staging' ? 'var(--color-warning)' : 'var(--color-success)'
                          }`
                        }}
                      >
                        <h4 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#ffffff' }}>
                          {env} Environment
                        </h4>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '10px', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>SDK Server Key:</span>
                          <code style={{ background: '#0a0d14', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', color: 'var(--accent-secondary)', fontFamily: 'var(--font-mono)' }}>
                            {envData.sdkKey}
                          </code>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => copyToClipboard(envData.sdkKey, `${env}_sdk`)}
                          >
                            {copiedKey === `${env}_sdk` ? 'Copied ✓' : <Copy size={13} />}
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '10px', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Client stream Key:</span>
                          <code style={{ background: '#0a0d14', padding: '6px 10px', borderRadius: '4px', fontSize: '12px', color: 'var(--accent-secondary)', fontFamily: 'var(--font-mono)' }}>
                            {envData.clientKey}
                          </code>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => copyToClipboard(envData.clientKey, `${env}_client`)}
                          >
                            {copiedKey === `${env}_client` ? 'Copied ✓' : <Copy size={13} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div>No keys available</div>
              )}
            </div>
            
            <div className="glass-panel" style={{ padding: '30px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 600, borderBottom: '1px solid var(--border-glass)', paddingBottom: '15px', marginBottom: '20px' }}>Registered webhooks</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>Webhooks alert external servers when feature configurations are changed.</p>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input type="text" className="input-field" placeholder="https://api.mycompany.com/webhooks/flags" style={{ flex: 1 }} disabled />
                <button className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }} disabled>Add Webhook</button>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>* Webhook editing is managed programmatically. Add via API endpoints or Postgres backend directly.</span>
            </div>
          </div>

        )}

      </div>

      {/* Guided Onboarding Tutorial Tour Overlay */}
      {tutorialStep !== null && (
        <>
          <div className="tutorial-backdrop" onClick={endTutorial} />
          <div 
            className="tutorial-popover"
            style={{
              top: `${popoverPos.top}px`,
              left: `${popoverPos.left}px`
            }}
          >
            <div className="tutorial-popover-header">
              <span className="tutorial-popover-title">
                <Sparkles size={16} color="var(--accent-secondary)" />
                {steps[tutorialStep - 1].title}
              </span>
              <button 
                onClick={endTutorial} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="tutorial-popover-body">
              {steps[tutorialStep - 1].body}
            </div>

            <div className="tutorial-popover-footer">
              <div className="tutorial-progress-bar">
                <div 
                  className="tutorial-progress-fill" 
                  style={{ width: `${(tutorialStep / steps.length) * 100}%` }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {tutorialStep > 1 && (
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                    onClick={() => setTutorialStep(tutorialStep - 1)}
                  >
                    Back
                  </button>
                )}
                <button 
                  className="btn btn-primary" 
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                  onClick={() => {
                    if (tutorialStep < steps.length) {
                      setTutorialStep(tutorialStep + 1);
                    } else {
                      endTutorial();
                    }
                  }}
                >
                  {tutorialStep === steps.length ? 'Finish' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Confetti Celebration */}
      {confetti && (
        <div className="confetti-container">
          {Array.from({ length: 40 }).map((_, i) => {
            const left = Math.random() * 100;
            const delay = Math.random() * 2;
            const color = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#bd00ff'][Math.floor(Math.random() * 6)];
            const size = Math.random() * 6 + 6;
            return (
              <div 
                key={i} 
                className="confetti-piece"
                style={{
                  left: `${left}%`,
                  animationDelay: `${delay}s`,
                  backgroundColor: color,
                  width: `${size}px`,
                  height: `${size}px`
                }}
              />
            );
          })}
        </div>
      )}

    </div>
  );
}

// Generate simple random IDs for rule forms
function uuid() {
  return Math.random().toString(36).substr(2, 9);
}
