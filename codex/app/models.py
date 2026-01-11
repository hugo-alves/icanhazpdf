from pydantic import BaseModel, Field


class FetchRequest(BaseModel):
    doi: str | None = Field(default=None, description="Digital Object Identifier")
    title: str | None = None
    authors: str | None = None
    year: int | None = None
    prefer_open_access: bool = True
    download: bool = False


class FetchResponse(BaseModel):
    found: bool
    pdf_url: str | None = None
    source: str | None = None
    metadata: dict | None = None
    cached: bool = False


class HealthResponse(BaseModel):
    status: str
