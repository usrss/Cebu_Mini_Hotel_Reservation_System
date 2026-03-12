"""
admin_panel/models.py

This app has NO models of its own.
All admin panel data is sourced from existing apps:
  - Guest management   → users.CustomUser
  - Payment management → payments.Payment (+ bookings.Booking)
  - Review management  → rooms.RoomReview, rooms.ReviewHelpfulness

Django requires this file for the app to be recognised as a package.
"""