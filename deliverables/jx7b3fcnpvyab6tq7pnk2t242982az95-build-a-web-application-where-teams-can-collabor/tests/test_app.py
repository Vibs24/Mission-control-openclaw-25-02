from werkzeug.security import generate_password_hash
import sqlite3

def signup_login(c,email='a@a.com',pw='pass123'):
    c.post('/signup', data={'email':email,'password':pw}, follow_redirects=True)
    c.post('/login', data={'email':email,'password':pw}, follow_redirects=True)

def test_auth_and_workspace(client):
    signup_login(client)
    rv=client.post('/workspaces', data={'name':'W1'}, follow_redirects=True)
    assert b'Board' in rv.data

def test_task_comment_and_move(client):
    signup_login(client,'u1@x.com','p1')
    client.post('/signup', data={'email':'u2@x.com','password':'p2'}, follow_redirects=True)
    client.post('/workspaces', data={'name':'W2'}, follow_redirects=True)
    client.post('/workspace/1/invite', data={'email':'u2@x.com','role':'member'}, follow_redirects=True)
    client.post('/workspace/1/task/new', data={'title':'T','description':'D','priority':'high','assignee_id':'2'}, follow_redirects=True)
    rv=client.post('/task/1', data={'comment':'hello','note':'n1'}, follow_redirects=True)
    assert b'hello' in rv.data
    m=client.post('/task/1/move', json={'status':'doing'})
    assert m.json.get('ok') is True
