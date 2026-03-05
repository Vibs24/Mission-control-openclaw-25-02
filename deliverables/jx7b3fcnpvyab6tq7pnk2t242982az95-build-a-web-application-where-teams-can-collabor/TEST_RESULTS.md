..                                                                       [100%]
=============================== warnings summary ===============================
tests/test_app.py: 15 warnings
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7b3fcnpvyab6tq7pnk2t242982az95-build-a-web-application-where-teams-can-collabor/.pydeps/sqlalchemy/sql/schema.py:3624: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    return util.wrap_callable(lambda ctx: fn(), fn)  # type: ignore

tests/test_app.py: 16 warnings
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7b3fcnpvyab6tq7pnk2t242982az95-build-a-web-application-where-teams-can-collabor/app/main.py:131: LegacyAPIWarning: The Query.get() method is considered legacy as of the 1.x series of SQLAlchemy and becomes a legacy construct in 2.0. The method is now available as Session.get() (deprecated since: 2.0) (Background on SQLAlchemy 2.0 at: https://sqlalche.me/e/b8d9)
    return User.query.get(uid) if uid else None

tests/test_app.py::test_signup_login_workspace_task_flow
tests/test_app.py::test_signup_login_workspace_task_flow
tests/test_app.py::test_invite_accept_and_notifications_and_move
tests/test_app.py::test_invite_accept_and_notifications_and_move
tests/test_app.py::test_invite_accept_and_notifications_and_move
tests/test_app.py::test_invite_accept_and_notifications_and_move
tests/test_app.py::test_invite_accept_and_notifications_and_move
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7b3fcnpvyab6tq7pnk2t242982az95-build-a-web-application-where-teams-can-collabor/.pydeps/flask_sqlalchemy/query.py:30: LegacyAPIWarning: The Query.get() method is considered legacy as of the 1.x series of SQLAlchemy and becomes a legacy construct in 2.0. The method is now available as Session.get() (deprecated since: 2.0) (Background on SQLAlchemy 2.0 at: https://sqlalche.me/e/b8d9)
    rv = self.get(ident)

tests/test_app.py::test_invite_accept_and_notifications_and_move
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7b3fcnpvyab6tq7pnk2t242982az95-build-a-web-application-where-teams-can-collabor/app/main.py:236: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    invite.accepted_at = datetime.utcnow()

tests/test_app.py::test_invite_accept_and_notifications_and_move
  /Users/syphaoffice1/Mission-control-openclaw-25:02/deliverables/jx7b3fcnpvyab6tq7pnk2t242982az95-build-a-web-application-where-teams-can-collabor/tests/test_app.py:95: LegacyAPIWarning: The Query.get() method is considered legacy as of the 1.x series of SQLAlchemy and becomes a legacy construct in 2.0. The method is now available as Session.get() (deprecated since: 2.0) (Background on SQLAlchemy 2.0 at: https://sqlalche.me/e/b8d9)
    task = Task.query.get(task.id)

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
2 passed, 40 warnings in 3.81s
