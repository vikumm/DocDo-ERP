from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://localhost/docdo"
    seg_store_dir: str = "/tmp/seg-store"
    seg_ttl_hours: int = 24
    seg_max_upload_bytes: int = 2 * 1024 * 1024 * 1024  # 2 GB
    seg_runner: str = "mock"  # mock | monai
    seg_model_dir: str = "./models"
    seg_embed_cache: int = 4  # interactive Vista3D embedding LRU capacity

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
