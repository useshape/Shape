ITEMS = []

def test_append():
    ITEMS.append(1)
    assert ITEMS == [1]

def test_len():
    assert len(ITEMS) == 1
