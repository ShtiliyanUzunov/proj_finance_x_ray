from fastapi import APIRouter, HTTPException

from ..models import GroupsPayload
from ..services.groups import load_groups, save_groups, validate_groups

router = APIRouter(tags=["groups"])


@router.get("/groups")
def get_groups():
    return {"groups": load_groups()}


@router.put("/groups")
def put_groups(payload: GroupsPayload):
    try:
        validate_groups(payload.groups)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    serialized = [g.model_dump() for g in payload.groups]
    save_groups(serialized)
    return {"groups": serialized}
