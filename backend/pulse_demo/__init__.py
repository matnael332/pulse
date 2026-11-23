"""pulse_demo: the public demo, the same pipeline run in the visitor's own browser.

``runner`` takes one export through the product's own steps (recognise, review, prepare, model,
score) without a server, a database, a language model or a plotting library: Python compiled for
the browser (Pyodide) runs it on files in the browser's memory. ``sample`` builds the export a
visitor without one of their own can download, and ``pack`` the files the site ships.
"""
