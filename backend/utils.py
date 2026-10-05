import hashlib
import os

def hash_api_key(api_key: str) -> str:
    salt = os.getenv("API_KEY_SALT", "default_salt_for_gakkum") # Pastikan ini di .env
    return hashlib.sha256((api_key + salt).encode()).hexdigest()

def verify_api_key(api_key: str, hashed_key: str) -> bool:
    return hash_api_key(api_key) == hashed_key
