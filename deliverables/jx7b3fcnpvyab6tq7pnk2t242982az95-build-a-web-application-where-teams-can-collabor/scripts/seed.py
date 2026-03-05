import os, sqlite3
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash
BASE=os.path.dirname(os.path.dirname(__file__))
DB=os.path.join(BASE,'instance','teamflow.db')
os.makedirs(os.path.dirname(DB),exist_ok=True)
conn=sqlite3.connect(DB)
conn.executescript(open(os.path.join(BASE,'schema.sql')).read())
for t in ['notifications','task_history','notes','comments','tasks','memberships','workspaces','users']:
    conn.execute(f'DELETE FROM {t}')
users=[('admin@team.com','admin123'),('alice@team.com','alice123'),('bob@team.com','bob123')]
for e,p in users:
    conn.execute('INSERT INTO users(email,password_hash,created_at) VALUES (?,?,?)',(e,generate_password_hash(p),datetime.utcnow().isoformat()))
admin=conn.execute("SELECT id FROM users WHERE email='admin@team.com'").fetchone()[0]
alice=conn.execute("SELECT id FROM users WHERE email='alice@team.com'").fetchone()[0]
bob=conn.execute("SELECT id FROM users WHERE email='bob@team.com'").fetchone()[0]
conn.execute('INSERT INTO workspaces(name,owner_id,created_at) VALUES (?,?,?)',('Acme Workspace',admin,datetime.utcnow().isoformat()))
wid=conn.execute('SELECT id FROM workspaces').fetchone()[0]
conn.execute('INSERT INTO memberships(workspace_id,user_id,role) VALUES (?,?,?)',(wid,admin,'admin'))
conn.execute('INSERT INTO memberships(workspace_id,user_id,role) VALUES (?,?,?)',(wid,alice,'member'))
conn.execute('INSERT INTO memberships(workspace_id,user_id,role) VALUES (?,?,?)',(wid,bob,'member'))
conn.execute('''INSERT INTO tasks(workspace_id,title,description,due_date,priority,status,assignee_id,creator_id,created_at,updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?)''',(wid,'Setup board','Initial setup',(datetime.utcnow()+timedelta(days=2)).date().isoformat(),'high','todo',alice,admin,datetime.utcnow().isoformat(),datetime.utcnow().isoformat()))
conn.commit(); conn.close(); print('Seeded: admin@team.com/admin123')
