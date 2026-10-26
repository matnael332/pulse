"""Google and Microsoft sign-in against a fake provider: discovery, keys and the token endpoint
are an httpx.MockTransport, the ID tokens are signed with a key made here."""

import base64
import hashlib
import json
import time
from urllib.parse import parse_qs, urlsplit

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from pulse_server.app import create_app
from pulse_server.migrate import upgrade

GOOGLE = "https://accounts.google.com"
MICROSOFT = "https://login.microsoftonline.com"
TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad"
CLIENT_ID = "client-123"


def _key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


KEY, OTHER_KEY = _key(), _key()


class FakeProvider:
    """Serves both providers' discovery, keys and token endpoints; ``claims`` tweak the token."""

    def __init__(self) -> None:
        self.claims: dict = {}
        self.signing_key = KEY
        self.pending: dict[str, dict] = {}  # code -> nonce and PKCE challenge

    def authorized(self, location: str, **claims) -> str:
        """What the provider does after the user agrees: a code for the callback."""
        query = {k: v[0] for k, v in parse_qs(urlsplit(location).query).items()}
        code = f"code-{len(self.pending)}"
        self.pending[code] = {
            "nonce": query["nonce"],
            "challenge": query["code_challenge"],
            "provider": "google" if location.startswith(GOOGLE) else "microsoft",
        }
        self.claims = claims
        return f"/auth/{self.pending[code]['provider']}/callback?code={code}&state={query['state']}"

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url == f"{GOOGLE}/.well-known/openid-configuration":
            return httpx.Response(200, json=self._discovery(GOOGLE, GOOGLE))
        if url.endswith("/v2.0/.well-known/openid-configuration"):
            issuer = f"{MICROSOFT}/{{tenantid}}/v2.0"
            return httpx.Response(200, json=self._discovery(MICROSOFT, issuer))
        if url.endswith("/keys"):
            public = jwt.algorithms.RSAAlgorithm.to_jwk(KEY.public_key(), as_dict=True)
            return httpx.Response(200, json={"keys": [{**public, "kid": "k1", "use": "sig"}]})
        if url.endswith("/token"):
            form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
            pending = self.pending.pop(form["code"], None)
            if pending is None or _challenge(form["code_verifier"]) != pending["challenge"]:
                return httpx.Response(400, json={"error": "invalid_grant"})
            return httpx.Response(200, json={"id_token": self._token(pending)})
        return httpx.Response(404)

    def _discovery(self, base: str, issuer: str) -> dict:
        return {
            "issuer": issuer,
            "authorization_endpoint": f"{base}/authorize",
            "token_endpoint": f"{base}/token",
            "jwks_uri": f"{base}/keys",
        }

    def _token(self, pending: dict) -> str:
        now = int(time.time())
        claims = {
            "sub": "user-1",
            "aud": CLIENT_ID,
            "iat": now,
            "exp": now + 600,
            "nonce": pending["nonce"],
            "name": "Dana",
        }
        if pending["provider"] == "google":
            claims |= {"iss": GOOGLE, "email": "Dana@Acme.example", "email_verified": True}
        else:
            claims |= {
                "iss": f"{MICROSOFT}/{TENANT}/v2.0",
                "tid": TENANT,
                "preferred_username": "dana@acme.example",
            }
        claims |= self.claims
        claims = {k: v for k, v in claims.items() if v is not None}
        return jwt.encode(claims, self.signing_key, algorithm="RS256", headers={"kid": "k1"})


def _challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


@pytest.fixture()
def provider():
    return FakeProvider()


@pytest.fixture()
def oidc_settings(server_settings):
    return server_settings.model_copy(
        update={
            "google_client_id": CLIENT_ID,
            "google_client_secret": "g-secret",
            "microsoft_client_id": CLIENT_ID,
            "microsoft_client_secret": "m-secret",
            "operator_emails": "dana@acme.example",
        }
    )


@pytest.fixture()
def client(oidc_settings, provider):
    upgrade(oidc_settings.database_url)
    app = create_app(oidc_settings, oidc_transport=httpx.MockTransport(provider.handler))
    with TestClient(app, follow_redirects=False) as test_client:
        yield test_client


def _sign_in(client, provider, name="google", next_path=None, **claims) -> httpx.Response:
    params = {"next": next_path} if next_path else {}
    start = client.get(f"/auth/{name}/login", params=params)
    assert start.status_code == 302
    return client.get(provider.authorized(start.headers["location"], **claims))


def test_the_login_redirect_carries_state_nonce_and_pkce(client):
    response = client.get("/auth/google/login")
    assert response.status_code == 302
    url = urlsplit(response.headers["location"])
    query = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert f"{url.scheme}://{url.netloc}{url.path}" == f"{GOOGLE}/authorize"
    assert query["client_id"] == CLIENT_ID and query["code_challenge_method"] == "S256"
    assert query["redirect_uri"] == "http://testserver/auth/google/callback"
    assert query["scope"] == "openid email profile" and query["state"] and query["nonce"]
    assert "pulse_oidc=" in response.headers["set-cookie"]


def test_a_google_sign_in_starts_a_session(client, provider):
    response = _sign_in(client, provider, next_path="/company")
    assert response.status_code == 302 and response.headers["location"] == "/company"
    me = client.get("/me").json()
    assert me["user"]["email"] == "dana@acme.example" and me["user"]["provider"] == "google"
    assert me["is_operator"] and me["state"] == "operator"


def test_a_microsoft_sign_in_checks_the_tenant_in_the_issuer(client, provider):
    assert _sign_in(client, provider, "microsoft").status_code == 302
    me = client.get("/me").json()
    assert me["user"]["provider"] == "microsoft"
    assert not me["is_operator"]  # Microsoft's address is not verified without xms_edov
    client.cookies.clear()
    wrong = _sign_in(client, provider, "microsoft", iss=f"{MICROSOFT}/another-tenant/v2.0")
    assert wrong.status_code == 400 and "issuer" in wrong.json()["detail"]


def test_microsoft_with_a_verified_address_can_be_an_operator(client, provider):
    _sign_in(client, provider, "microsoft", xms_edov=True)
    assert client.get("/me").json()["is_operator"]


def test_an_unverified_google_address_is_not_an_operator(client, provider):
    _sign_in(client, provider, email_verified=False)
    me = client.get("/me").json()
    assert not me["is_operator"] and me["state"] == "needs_company"


@pytest.mark.parametrize(
    ("claims", "reason"),
    [
        ({"aud": "someone-else"}, "InvalidAudienceError"),
        ({"iss": "https://evil.example"}, "issuer"),
        ({"exp": int(time.time()) - 3600}, "ExpiredSignatureError"),
        ({"nonce": "replayed"}, "nonce"),
        ({"email": None}, "email"),
    ],
)
def test_a_bad_id_token_is_refused(client, provider, claims, reason):
    response = _sign_in(client, provider, **claims)
    assert response.status_code == 400 and reason in response.json()["detail"]
    assert client.get("/me").status_code == 401


def test_a_token_signed_with_another_key_is_refused(client, provider):
    provider.signing_key = OTHER_KEY
    response = _sign_in(client, provider)
    assert response.status_code == 400 and "InvalidSignatureError" in response.json()["detail"]


def test_a_wrong_or_missing_state_is_refused(client, provider):
    start = client.get("/auth/google/login")
    callback = provider.authorized(start.headers["location"])
    forged = callback.replace("state=", "state=x")
    assert client.get(forged).status_code == 400
    client.cookies.clear()  # no state cookie: the sign-in did not start in this browser
    assert client.get(callback).status_code == 400
    assert client.get("/me").status_code == 401


def test_next_never_leaves_the_site(client, provider):
    response = _sign_in(client, provider, next_path="//evil.example/x")
    assert response.headers["location"] == "/"


def test_unconfigured_providers(server):
    assert server.get("/auth/google/login").status_code == 404
    assert server.get("/auth/providers").json() == {"providers": ["dev"]}


def test_providers_lists_the_configured_ones(client):
    assert client.get("/auth/providers").json() == {"providers": ["google", "microsoft", "dev"]}


def test_the_state_cookie_is_signed(client, provider, oidc_settings):
    client.get("/auth/google/login")
    tampered = json.dumps({"p": "google", "s": "x", "n": "y", "v": "z", "next": "/"})
    client.cookies.set("pulse_oidc", base64.urlsafe_b64encode(tampered.encode()).decode())
    assert client.get("/auth/google/callback?code=c&state=x").status_code == 400
