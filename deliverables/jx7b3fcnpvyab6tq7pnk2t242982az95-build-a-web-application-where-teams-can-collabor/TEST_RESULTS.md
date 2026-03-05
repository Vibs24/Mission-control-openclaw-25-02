..                                                                       [100%]
=============================== warnings summary ===============================
tests/test_app.py::test_auth_and_workspace
tests/test_app.py::test_task_comment_and_move
tests/test_app.py::test_task_comment_and_move
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7b3fcnpvyab6tq7pnk2t242982az95-build-a-web-application-where-teams-can-collabor/app.py:83: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    (email, generate_password_hash(pw), datetime.utcnow().isoformat()))

tests/test_app.py::test_auth_and_workspace
tests/test_app.py::test_task_comment_and_move
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7b3fcnpvyab6tq7pnk2t242982az95-build-a-web-application-where-teams-can-collabor/app.py:114: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    cur = db.execute('INSERT INTO workspaces(name,owner_id,created_at) VALUES (?,?,?)', (name, u['id'], datetime.utcnow().isoformat()))

tests/test_app.py::test_task_comment_and_move
tests/test_app.py::test_task_comment_and_move
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7b3fcnpvyab6tq7pnk2t242982az95-build-a-web-application-where-teams-can-collabor/app.py:185: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    VALUES (?,?,?,?,?,?,?,?,?,?)''',(workspace_id,title,desc,due,pr,'todo',assignee,u['id'],datetime.utcnow().isoformat(),datetime.utcnow().isoformat()))

tests/test_app.py::test_task_comment_and_move
tests/test_app.py::test_task_comment_and_move
tests/test_app.py::test_task_comment_and_move
tests/test_app.py::test_task_comment_and_move
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7b3fcnpvyab6tq7pnk2t242982az95-build-a-web-application-where-teams-can-collabor/app.py:61: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    (task_id, actor_id, action, payload, datetime.utcnow().isoformat()))

tests/test_app.py::test_task_comment_and_move
tests/test_app.py::test_task_comment_and_move
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7b3fcnpvyab6tq7pnk2t242982az95-build-a-web-application-where-teams-can-collabor/app.py:65: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    (user_id, msg, datetime.utcnow().isoformat()))

tests/test_app.py::test_task_comment_and_move
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7b3fcnpvyab6tq7pnk2t242982az95-build-a-web-application-where-teams-can-collabor/app.py:211: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    db.execute('INSERT INTO comments(task_id,user_id,content,created_at) VALUES (?,?,?,?)',(task_id,u['id'],comment,datetime.utcnow().isoformat()))

tests/test_app.py::test_task_comment_and_move
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7b3fcnpvyab6tq7pnk2t242982az95-build-a-web-application-where-teams-can-collabor/app.py:216: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    db.execute('INSERT INTO notes(task_id,user_id,content,created_at) VALUES (?,?,?,?)',(task_id,u['id'],note,datetime.utcnow().isoformat()))

tests/test_app.py::test_task_comment_and_move
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7b3fcnpvyab6tq7pnk2t242982az95-build-a-web-application-where-teams-can-collabor/app.py:199: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    db.execute('UPDATE tasks SET status=?, updated_at=? WHERE id=?',(status,datetime.utcnow().isoformat(),task_id))

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
2 passed, 16 warnings in 0.41s
