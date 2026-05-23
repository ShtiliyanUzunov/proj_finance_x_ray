from fastapi import APIRouter

from ..models import RulesPayload
from ..services.rules import load_rules, save_rules

router = APIRouter(tags=["rules"])


@router.get("/rules")
def get_rules():
    return {"rules": load_rules()}


@router.put("/rules")
def put_rules(payload: RulesPayload):
    serialized = [r.model_dump() for r in payload.rules]
    save_rules(serialized)
    return {"rules": serialized}
