"""pulse_server: the hosted site's backend (FastAPI).

Companies sign in with Google or Microsoft (one user per company), wait for an operator to
approve them, and get a customer folder on approval. Postgres on the server, a SQLite file in
tests and local development; ``pulse-server migrate`` / ``serve --migrate`` apply the migrations.
"""
