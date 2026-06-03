from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Transaction:
    date: date
    debit: float | None = None
    credit: float | None = None
    description: str = ""
    counterparty: str = ""
    counterparty_account: str = ""
    transaction_type: str = ""
    reference: str = ""
    source: str = ""
    row_index: int = 0
