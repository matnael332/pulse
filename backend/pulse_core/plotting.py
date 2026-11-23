"""The plotting library, loaded only when something is drawn.

The figures are the pipeline's only use of matplotlib and seaborn, and importing them is slow (and
not possible everywhere the pipeline runs: the browser demo has neither). One theme for every
figure, whichever is drawn first.
"""

from __future__ import annotations

from functools import lru_cache


@lru_cache(maxsize=1)
def figure_class():
    """matplotlib's ``Figure`` on the Agg backend, with the pipeline's theme set."""
    import matplotlib

    matplotlib.use("Agg")

    import seaborn as sns
    from matplotlib.figure import Figure

    sns.set_theme(style="whitegrid", context="notebook")
    return Figure
