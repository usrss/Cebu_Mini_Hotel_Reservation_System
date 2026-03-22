# notifications/signals.py
#
# All notification calls are now handled directly in:
#   bookings/signals.py     — booking lifecycle events
#   payments/models.py      — payment events (mark_paid, mark_failed)
#   staff/signals.py        — cleaning task auto-assignment on checkout
#   staff/views.py          — cleaning task manual assignment
#
# This file is intentionally empty.