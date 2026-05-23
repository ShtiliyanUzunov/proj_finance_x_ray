from pydantic import BaseModel, Field


class RenameRequest(BaseModel):
    name: str


class Rule(BaseModel):
    id: str
    category: str
    columns: list[str]
    keywords: list[str]
    color: str | None = None  # CSS hex like "#1976d2"; UI uses it to distinguish rules at a glance


class RulesPayload(BaseModel):
    rules: list[Rule] = Field(default_factory=list)


class Group(BaseModel):
    """A non-leaf category that aggregates other categories.

    `children` is a list of names that should resolve to either a leaf
    (i.e. a `rule.category` value) or another group. Validation lives in the
    groups service rather than the model so we can produce specific error
    messages and detect cycles across the full set.
    """

    name: str
    children: list[str] = Field(default_factory=list)


class GroupsPayload(BaseModel):
    groups: list[Group] = Field(default_factory=list)
