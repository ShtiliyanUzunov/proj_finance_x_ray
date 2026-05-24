from pydantic import BaseModel, Field


class RenameRequest(BaseModel):
    name: str


class Rule(BaseModel):
    id: str
    category: str
    columns: list[str]
    patterns: list[str]
    color: str | None = None  # CSS hex like "#1976d2"; UI uses it to distinguish rules at a glance


class RulesPayload(BaseModel):
    rules: list[Rule] = Field(default_factory=list)


class Group(BaseModel):
    """A non-leaf category that aggregates other categories.

    `children` is a list of IDs that should resolve to either a rule (leaf,
    by `rule.id`) or another group (by `group.id`). References are by ID,
    not name, so renames are safe and a group may share its `name` with a
    rule's `category` without ambiguity. Validation lives in the groups
    service so we can produce specific error messages and detect cycles
    across the full set.
    """

    id: str
    name: str
    children: list[str] = Field(default_factory=list)


class GroupsPayload(BaseModel):
    groups: list[Group] = Field(default_factory=list)
