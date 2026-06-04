from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any

_FALLBACK_HUMOR = [
    {
        "title": "That's not trash",
        "reason": "BinBoss only sorts stuff you'd actually throw away — not people, names, or abstract ideas.",
        "tip": "Try something physical: a bottle, peel, battery, or old phone.",
    },
    {
        "title": "No bin for that",
        "reason": "We asked the bins. They said that's not on the pickup list.",
        "tip": "Describe a disposable object and we'll find the right lid.",
    },
]


@dataclass
class HumorousResult:
    item: str
    title: str
    reason: str
    tip: str
    humorous: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "humorous": True,
            "item": self.item,
            "title": self.title,
            "reason": self.reason,
            "tip": self.tip,
        }


def make_humorous_result(
    item: str,
    *,
    reason: str | None = None,
    tip: str | None = None,
    title: str | None = None,
) -> HumorousResult:
    item = item.strip()
    r = (reason or "").strip()
    t = (tip or "").strip()
    if r or t:
        return HumorousResult(
            item=item,
            title=title or "That's not trash",
            reason=r or "That's not something we put in a dustbin.",
            tip=t or "Describe a real throwaway item instead.",
        )
    pick = random.choice(_FALLBACK_HUMOR)
    return HumorousResult(
        item=item,
        title=title or pick["title"],
        reason=pick["reason"],
        tip=pick["tip"],
    )
