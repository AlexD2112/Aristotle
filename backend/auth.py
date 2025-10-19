import os
import time
import json
import requests
from jose import jwk, jwt
from jose.utils import base64url_decode

# Assumptions:
# - Environment provides COGNITO_USER_POOL_ID and COGNITO_REGION
# - Tokens passed are standard Cognito ID tokens (JWT) signed with RS256
# - If env vars are missing, functions will raise a ValueError describing what's missing

COGNITO_USER_POOL_ID = os.getenv('COGNITO_USER_POOL_ID')
COGNITO_REGION = os.getenv('COGNITO_REGION') or os.getenv('AWS_REGION') or 'us-east-1'

_jwks_cache = None
_jwks_last_fetch = 0

def _fetch_jwks():
    global _jwks_cache, _jwks_last_fetch
    if _jwks_cache and (time.time() - _jwks_last_fetch) < 3600:
        return _jwks_cache
    if not COGNITO_USER_POOL_ID:
        raise ValueError('COGNITO_USER_POOL_ID environment variable is required for token verification')
    jwks_url = f'https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}/.well-known/jwks.json'
    resp = requests.get(jwks_url, timeout=5)
    resp.raise_for_status()
    _jwks_cache = resp.json()
    _jwks_last_fetch = time.time()
    return _jwks_cache


def verify_cognito_jwt(token: str, audience: str = None) -> dict:
    """Verify an Amazon Cognito JWT (ID token) and return the decoded claims.

    Raises an exception on invalid token. If `audience` is provided, the token's aud must match it.
    """
    if not token:
        raise ValueError('Missing token')
    # Remove Bearer prefix if present
    if token.lower().startswith('bearer '):
        token = token.split(' ', 1)[1]

    # Split token headers
    headers = jwt.get_unverified_header(token)
    kid = headers.get('kid')
    if not kid:
        raise ValueError('Token header missing kid')

    jwks = _fetch_jwks()
    key_data = None
    for key in jwks.get('keys', []):
        if key.get('kid') == kid:
            key_data = key
            break
    if not key_data:
        raise ValueError('Unable to find matching JWKS key')

    public_key = jwk.construct(key_data)

    # Validate signature
    message, encoded_signature = token.rsplit('.', 1)
    decoded_signature = base64url_decode(encoded_signature.encode('utf-8'))
    if not public_key.verify(message.encode('utf-8'), decoded_signature):
        raise ValueError('Invalid token signature')

    # Decode claims without verifying signature again (we've verified manually)
    claims = jwt.get_unverified_claims(token)

    # Check token expiration
    if 'exp' in claims and time.time() > claims['exp']:
        raise ValueError('Token is expired')

    if audience and claims.get('aud') != audience:
        raise ValueError('Token audience mismatch')

    return claims

