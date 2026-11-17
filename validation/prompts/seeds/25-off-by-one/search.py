def binary_search(xs, target):
    lo, hi = 0, len(xs)
    while lo < hi:
        mid = (lo + hi) // 2
        if xs[mid] < target:
            lo = mid
        elif xs[mid] > target:
            hi = mid
        else:
            return mid
    return -1
