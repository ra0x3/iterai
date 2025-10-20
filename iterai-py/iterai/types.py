from enum import Enum


class ImprovementType(Enum):
    STANDARD = "standard"
    SYNTHETIC = "synthetic"


class Step:
    def __init__(self, order: int, text: str):
        self.order = int(order)
        self.text = text

    def to_dict(self) -> dict:
        return {"order": self.order, "text": self.text}

    @classmethod
    def from_dict(cls, data: dict):
        return cls(order=int(data.get("order", 0)), text=str(data.get("text", "")))
