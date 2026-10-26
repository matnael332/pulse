"""Sign-in with Google and Microsoft: OpenID Connect, authorization code flow with PKCE.

Written on httpx and PyJWT (both were locked already) instead of a framework: the flow is short,
Microsoft's multi-tenant issuer needs custom code either way, and tests swap the network for an
``httpx.MockTransport``. The ID token is checked for its RS256 signature against the provider's
keys, the audience, the issuer, the expiry and the nonce.

An address counts as verified only when the provider says so: Google's ``email_verified``, and
Microsoft's optional ``xms_edov`` claim (Microsoft's ``email`` is not verified by default).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
import jwt

from pulse_server.settings import Settings

GOOGLE_ISSUERS = frozenset({"https://accounts.google.com", "accounts.google.com"})
MICROSOFT_SHARED_TENANTS = frozenset({"common", "organizations", "consumers"})
LEEWAY_SECONDS = 60


class OidcError(Exception):
    """The sign-in failed; the message says why (never a token)."""


@dataclass(frozen=True)
class Provider:
    name: str
    discovery_url: str
    client_id: str
    client_secret: str
    tenant: str | None = None


@dataclass(frozen=True)
class Identity:
    subject: str
    email: str
    email_verified: bool
    name: str | None


def providers(settings: Settings) -> dict[str, Provider]:
    """The providers whose client id and secret are both set."""
    found = {}
    if settings.google_client_id and settings.google_client_secret:
        found["google"] = Provider(
            "google",
            "https://accounts.google.com/.well-known/openid-configuration",
            settings.google_client_id,
            settings.google_client_secret,
        )
    if settings.microsoft_client_id and settings.microsoft_client_secret:
        tenant = settings.microsoft_tenant
        found["microsoft"] = Provider(
            "microsoft",
            f"https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration",
            settings.microsoft_client_id,
            settings.microsoft_client_secret,
            tenant,
        )
    return found


def pkce_pair() -> tuple[str, str]:
    """(verifier, S256 challenge)."""
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    return verifier, base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


class OidcClient:
    def __init__(self, transport: httpx.BaseTransport | None = None) -> None:
        self._http = httpx.Client(transport=transport, timeout=10)
        self._discovery: dict[str, dict] = {}
        self._keys: dict[str, jwt.PyJWKSet] = {}

    def _get_json(self, url: str) -> dict:
        try:
            response = self._http.get(url)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise OidcError(f"provider unreachable: {type(exc).__name__}") from exc

    def discover(self, provider: Provider) -> dict:
        if provider.name not in self._discovery:
            self._discovery[provider.name] = self._get_json(provider.discovery_url)
        return self._discovery[provider.name]

    def authorize_url(
        self, provider: Provider, redirect_uri: str, state: str, nonce: str, challenge: str
    ) -> str:
        query = {
            "response_type": "code",
            "response_mode": "query",  # form_post would not carry the SameSite=Lax state cookie
            "client_id": provider.client_id,
            "redirect_uri": redirect_uri,
            "scope": "openid email profile",
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
        return f"{self.discover(provider)['authorization_endpoint']}?{urlencode(query)}"

    def exchange(self, provider: Provider, code: str, redirect_uri: str, verifier: str) -> str:
        """The authorization code for the ID token."""
        try:
            response = self._http.post(
                self.discover(provider)["token_endpoint"],
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": provider.client_id,
                    "client_secret": provider.client_secret,
                    "code_verifier": verifier,
                },
                headers={"Accept": "application/json"},
            )
        except httpx.HTTPError as exc:
            raise OidcError(f"provider unreachable: {type(exc).__name__}") from exc
        if response.status_code != 200:
            raise OidcError(f"the code was refused ({response.status_code})")
        id_token = response.json().get("id_token")
        if not id_token:
            raise OidcError("no ID token in the provider's answer")
        return id_token

    def _key(self, provider: Provider, kid: str | None) -> jwt.PyJWK:
        for refresh in (False, True):
            if refresh or provider.name not in self._keys:
                jwks = self._get_json(self.discover(provider)["jwks_uri"])
                self._keys[provider.name] = jwt.PyJWKSet.from_dict(jwks)
            for key in self._keys[provider.name].keys:
                if key.key_id == kid:
                    return key
        raise OidcError("the ID token is signed with an unknown key")

    def identity(self, provider: Provider, id_token: str, nonce: str) -> Identity:
        try:
            header = jwt.get_unverified_header(id_token)
            if header.get("alg") != "RS256":
                raise OidcError("unexpected signing algorithm")
            claims = jwt.decode(
                id_token,
                self._key(provider, header.get("kid")),
                algorithms=["RS256"],
                audience=provider.client_id,
                leeway=LEEWAY_SECONDS,
                options={
                    "require": ["exp", "iat", "iss", "aud", "sub"],
                    "verify_iss": False,  # checked below: Microsoft's depends on the tenant
                },
            )
        except jwt.PyJWTError as exc:
            raise OidcError(f"invalid ID token: {type(exc).__name__}") from exc
        self._check_issuer(provider, claims)
        if not hmac.compare_digest(str(claims.get("nonce", "")), nonce):
            raise OidcError("the ID token's nonce does not match")
        if provider.name == "microsoft":
            email = claims.get("email") or claims.get("preferred_username")
            verified = claims.get("xms_edov") in (True, "true", "1", 1)
        else:
            email = claims.get("email")
            verified = claims.get("email_verified") in (True, "true")
        if not email or "@" not in email:
            raise OidcError("the provider did not share an email address")
        return Identity(str(claims["sub"]), email.lower(), verified, claims.get("name"))

    def _check_issuer(self, provider: Provider, claims: dict) -> None:
        issuer = claims.get("iss")
        if provider.name == "google":
            ok = issuer in GOOGLE_ISSUERS
        elif provider.name == "microsoft":
            tid = str(claims.get("tid", ""))
            expected = self.discover(provider)["issuer"].replace("{tenantid}", tid)
            ok = bool(tid) and issuer == expected
            if provider.tenant not in MICROSOFT_SHARED_TENANTS:
                ok = ok and tid == provider.tenant
        else:
            ok = issuer == self.discover(provider)["issuer"]
        if not ok:
            raise OidcError("the ID token's issuer is not the provider")
