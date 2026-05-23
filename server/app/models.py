from pydantic import BaseModel, Field


class RenameRequest(BaseModel):
    name: str


class Rule(BaseModel):
    id: str
    category: str
    columns: list[str]
    keywords: list[str]


class RulesPayload(BaseModel):
    rules: list[Rule] = Field(default_factory=list)
