# Architecture

- Flask monolith with JSON APIs + server templates.
- SQLAlchemy ORM over SQLite; all entities in relational tables.
- Auth via Flask-Login + remember session cookie.
- Role authorization with workspace membership (admin/member).
- Client-side dynamic UX through fetch + DOM rendering for near-real-time board interactions.
