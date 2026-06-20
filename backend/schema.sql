-- DDL Schema for Feature Flag System

-- Table: admins
CREATE TABLE IF NOT EXISTS admins (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: projects
CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: project_environments
CREATE TABLE IF NOT EXISTS project_environments (
    id VARCHAR(50) PRIMARY KEY,
    project_id VARCHAR(50) REFERENCES projects(id) ON DELETE CASCADE,
    environment VARCHAR(20) NOT NULL, -- 'dev', 'staging', 'prod'
    sdk_key VARCHAR(100) UNIQUE NOT NULL,
    client_key VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, environment)
);

-- Table: flags
CREATE TABLE IF NOT EXISTS flags (
    id VARCHAR(50) PRIMARY KEY,
    project_id VARCHAR(50) REFERENCES projects(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'bool', 'string', 'number', 'json'
    is_killed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, key)
);

-- Table: flag_variants
CREATE TABLE IF NOT EXISTS flag_variants (
    id VARCHAR(50) PRIMARY KEY,
    flag_id VARCHAR(50) REFERENCES flags(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    value JSONB NOT NULL
);

-- Table: flag_environments
CREATE TABLE IF NOT EXISTS flag_environments (
    id VARCHAR(50) PRIMARY KEY,
    flag_id VARCHAR(50) REFERENCES flags(id) ON DELETE CASCADE,
    environment VARCHAR(20) NOT NULL, -- 'dev', 'staging', 'prod'
    enabled BOOLEAN DEFAULT FALSE,
    default_variant VARCHAR(100) NOT NULL,
    rollout_percentage INT DEFAULT NULL, -- percentage rollout (0-100)
    rollout_weights JSONB DEFAULT NULL,  -- weights JSON: { "var1": 50, "var2": 50 }
    UNIQUE(flag_id, environment)
);

-- Table: flag_rules
CREATE TABLE IF NOT EXISTS flag_rules (
    id VARCHAR(50) PRIMARY KEY,
    flag_environment_id VARCHAR(50) REFERENCES flag_environments(id) ON DELETE CASCADE,
    priority INT NOT NULL,
    attribute VARCHAR(100) NOT NULL,
    operator VARCHAR(20) NOT NULL, -- 'eq', 'neq', 'in', 'gt', 'lt', 'contains'
    value TEXT NOT NULL,
    variant VARCHAR(100) NOT NULL
);

-- Table: audit_log
CREATE TABLE IF NOT EXISTS audit_log (
    id VARCHAR(50) PRIMARY KEY,
    flag_id VARCHAR(50) REFERENCES flags(id) ON DELETE SET NULL,
    flag_key VARCHAR(100) NOT NULL,
    actor_id VARCHAR(50) NOT NULL,
    actor_name VARCHAR(100) NOT NULL,
    action VARCHAR(20) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'TOGGLE', 'KILL'
    environment VARCHAR(20),
    before_snapshot JSONB,
    after_snapshot JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table: flag_evaluations (logged async)
CREATE TABLE IF NOT EXISTS flag_evaluations (
    id VARCHAR(50) PRIMARY KEY,
    flag_id VARCHAR(50) REFERENCES flags(id) ON DELETE CASCADE,
    flag_key VARCHAR(100) NOT NULL,
    environment VARCHAR(20) NOT NULL,
    variant_returned VARCHAR(100) NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Webhooks table (for B2B product thinking)
CREATE TABLE IF NOT EXISTS webhooks (
    id VARCHAR(50) PRIMARY KEY,
    project_id VARCHAR(50) REFERENCES projects(id) ON DELETE CASCADE,
    url VARCHAR(255) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
