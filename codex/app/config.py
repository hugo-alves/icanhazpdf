import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False)
    app_name: str = "paper-fetcher"
    # Use /tmp for serverless (Vercel), local path otherwise
    cache_db_path: str = os.environ.get("CACHE_DB_PATH", "/tmp/cache.sqlite" if os.environ.get("VERCEL") else "./cache.sqlite")
    cache_ttl_seconds: int = 60 * 60 * 24 * 7
    request_timeout_seconds: int = 20

    # API keys / emails for services
    semantic_scholar_api_key: str | None = None
    unpaywall_email: str | None = None
    core_api_key: str | None = None

    # User agent for polite requests
    user_agent: str = "paper-fetcher/1.0 (mailto:contact@example.com)"


settings = Settings()
