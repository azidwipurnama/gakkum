from pydantic import BaseModel, Field
from typing import List

class InterfaceMetric(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    bytes_sent: int = Field(..., ge=0)
    bytes_recv: int = Field(..., ge=0)
    packets_sent: int = Field(..., ge=0)
    packets_recv: int = Field(..., ge=0)

class AgentReport(BaseModel):
    agent_id: str = Field(..., min_length=1, max_length=100)
    timestamp: int = Field(..., gt=0) # Epoch detik
    interfaces: List[InterfaceMetric] = Field(..., min_items=1, max_items=20)
