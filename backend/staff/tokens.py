"""
staff/tokens.py

Secure token generator for staff account activation.

Uses Django's PasswordResetTokenGenerator as a base so tokens:
  - Are cryptographically signed with SECRET_KEY
  - Expire automatically (controlled by PASSWORD_RESET_TIMEOUT, default 3 days)
  - Are invalidated after the password is set (last_login / password hash changes)
  - Cannot be used for a different user (uidb64 + token are bound together)

Usage:
    from staff.tokens import staff_activation_token

    # Generate
    token = staff_activation_token.make_token(user)

    # Validate
    is_valid = staff_activation_token.check_token(user, token)
"""

from django.contrib.auth.tokens import PasswordResetTokenGenerator
import six


class StaffActivationTokenGenerator(PasswordResetTokenGenerator):
    """
    Generates a one-time activation token for a staff account.

    The hash value includes:
      - user.pk           — binds the token to one specific user
      - user.is_active    — token becomes invalid once the account is activated
      - user.password     — token becomes invalid once the password is set
      - timestamp         — token expires per PASSWORD_RESET_TIMEOUT setting

    Once the staff member activates and sets a password, all three of the
    above values change, so the token can never be reused.
    """

    def _make_hash_value(self, user, timestamp):
        return (
            six.text_type(user.pk)
            + six.text_type(timestamp)
            + six.text_type(user.is_active)
            + six.text_type(user.password)
        )


staff_activation_token = StaffActivationTokenGenerator()