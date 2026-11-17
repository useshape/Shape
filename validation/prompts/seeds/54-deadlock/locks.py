import threading

a = threading.Lock()
b = threading.Lock()

def left():
    with a:
        with b:
            return "left"

def right():
    with b:
        with a:
            return "right"
