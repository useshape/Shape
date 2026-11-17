from datetime import datetime

def is_same_day(a: str, b: str) -> bool:
    return a[:10] == b[:10]
