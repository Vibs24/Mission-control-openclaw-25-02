CREATE TABLE IF NOT EXISTS users(id bigserial PRIMARY KEY,email text UNIQUE NOT NULL,password_hash text NOT NULL,role text NOT NULL,created_at timestamptz default now());
CREATE TABLE IF NOT EXISTS tickets(id bigserial PRIMARY KEY,workspace_id bigint,title text NOT NULL,description text,priority text,status text,assignee_id bigint,created_at timestamptz default now());
CREATE TABLE IF NOT EXISTS messages(id bigserial PRIMARY KEY,ticket_id bigint NOT NULL,author_id bigint NOT NULL,body text NOT NULL,created_at timestamptz default now());
CREATE TABLE IF NOT EXISTS tags(id bigserial PRIMARY KEY,name text UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs(id bigserial PRIMARY KEY,actor_id bigint,action text NOT NULL,entity text NOT NULL,payload jsonb,created_at timestamptz default now());
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tickets_workspace ON tickets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
