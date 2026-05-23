"""Persistence and validation for nested category groups.

Groups are pure aggregations over the leaf categories defined by rules. A group
has a `name` and a list of `children` (which may resolve to leaves or to other
groups). Groups themselves carry no matching logic — they are purely a
presentational/reporting overlay.

Stored as a JSON list at `CLASSIFICATION_DIR/groups.json` so the file is
human-editable and survives across server restarts.
"""

from __future__ import annotations

import json

from ..config import CLASSIFICATION_DIR
from ..models import Group

_GROUPS_PATH = CLASSIFICATION_DIR / "groups.json"


def load_groups() -> list[dict]:
    if not _GROUPS_PATH.exists():
        return []
    try:
        data = json.loads(_GROUPS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(data, list):
        return []
    return data


def save_groups(groups: list[dict]) -> None:
    _GROUPS_PATH.write_text(json.dumps(groups, ensure_ascii=False, indent=2), encoding="utf-8")


def detect_cycle(groups: list[Group]) -> list[str] | None:
    """Return the cycle as a list of group names if one exists, else None.

    Uses DFS with three-state coloring (WHITE/GRAY/BLACK). Children that do not
    refer to a known group are treated as leaves and ignored — they cannot
    participate in a cycle by definition.
    """
    by_name: dict[str, list[str]] = {g.name: list(g.children) for g in groups}
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {name: WHITE for name in by_name}

    def dfs(name: str, path: list[str]) -> list[str] | None:
        if name not in by_name:
            return None
        if color[name] == GRAY:
            return path + [name]
        if color[name] == BLACK:
            return None
        color[name] = GRAY
        next_path = path + [name]
        for child in by_name[name]:
            cycle = dfs(child, next_path)
            if cycle is not None:
                return cycle
        color[name] = BLACK
        return None

    for name in by_name:
        if color[name] == WHITE:
            cycle = dfs(name, [])
            if cycle is not None:
                return cycle
    return None


def validate_groups(groups: list[Group], leaf_names: set[str]) -> None:
    """Raise ValueError with a human-readable message on any structural problem."""
    seen: set[str] = set()
    for g in groups:
        name = g.name.strip()
        if not name:
            raise ValueError("Group name cannot be empty")
        if name != g.name:
            raise ValueError(f"Group name '{g.name}' has leading/trailing whitespace")
        if name in seen:
            raise ValueError(f"Duplicate group name: '{name}'")
        seen.add(name)
        if name in leaf_names:
            raise ValueError(
                f"Group name '{name}' collides with a rule category — pick a different name"
            )
        if name in g.children:
            raise ValueError(f"Group '{name}' cannot contain itself as a child")

    cycle = detect_cycle(groups)
    if cycle is not None:
        raise ValueError(f"Cycle detected in group references: {' → '.join(cycle)}")
