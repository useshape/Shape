balance = 100

def withdraw(amount):
    global balance
    if balance >= amount:
        # TOCTOU: another thread can drain the account here.
        balance -= amount
        return True
    return False
