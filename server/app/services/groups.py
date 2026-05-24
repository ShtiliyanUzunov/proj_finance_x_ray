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

    Cycle detection walks group→group references via IDs (children that are not
    a known group ID — i.e. rule IDs or ghosts — are leaves and can't participate
    in a cycle). The returned list is rendered with names for human consumption.
    """
    by_id: dict[str, list[str]] = {g.id: list(g.children) for g in groups}
    name_by_id: dict[str, str] = {g.id: g.name for g in groups}
    WHITE, GRAY, BLACK = 0, 1, 2
    color: dict[str, int] = {gid: WHITE for gid in by_id}

    def dfs(gid: str, path: list[str]) -> list[str] | None:
        if gid not in by_id:
            return None
        if color[gid] == GRAY:
            return path + [name_by_id[gid]]
        if color[gid] == BLACK:
            return None
        color[gid] = GRAY
        next_path = path + [name_by_id[gid]]
        for child in by_id[gid]:
            cycle = dfs(child, next_path)
            if cycle is not None:
                return cycle
        color[gid] = BLACK
        return None

    for gid in by_id:
        if color[gid] == WHITE:
            cycle = dfs(gid, [])
            if cycle is not None:
                return cycle
    return None


def validate_groups(groups: list[Group]) -> None:
    """Raise ValueError with a human-readable message on any structural problem.

    Now that children are IDs, group names no longer need to be globally unique
    against rule categories — references are unambiguous. We still enforce
    unique IDs and unique names (the latter is purely a UX/clarity guard).
    """
    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    for g in groups:
        gid = g.id.strip()
        if not gid:
            raise ValueError("Group id cannot be empty")
        if gid != g.id:
            raise ValueError(f"Group id '{g.id}' has leading/trailing whitespace")
        if gid in seen_ids:
            raise ValueError(f"Duplicate group id: '{gid}'")
        seen_ids.add(gid)

        name = g.name.strip()
        if not name:
            raise ValueError("Group name cannot be empty")
        if name != g.name:
            raise ValueError(f"Group name '{g.name}' has leading/trailing whitespace")
        if name in seen_names:
            raise ValueError(f"Duplicate group name: '{name}'")
        seen_names.add(name)

        if gid in g.children:
            raise ValueError(f"Group '{name}' cannot contain itself as a child")

    cycle = detect_cycle(groups)
    if cycle is not None:
        raise ValueError(f"Cycle detected in group references: {' → '.join(cycle)}")
