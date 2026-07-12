# Deploying uxloom.dev

## 1. Enable GitHub Pages

On the `uxloom-dev/uxloom` repository:

1. Go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Select branch **main**, folder **/docs**, and save.

The `docs/CNAME` file already sets the custom domain to `uxloom.dev`.

## 2. Hostinger DNS (apex domain → GitHub Pages)

In Hostinger's DNS Zone editor for `uxloom.dev`:

**A records** (apex `@`), one record per IP:

| Type | Name | Points to        |
|------|------|------------------|
| A    | @    | 185.199.108.153  |
| A    | @    | 185.199.109.153  |
| A    | @    | 185.199.110.153  |
| A    | @    | 185.199.111.153  |

**CNAME record** for `www`:

| Type  | Name | Points to             |
|-------|------|-----------------------|
| CNAME | www  | uxloom-dev.github.io  |

Remove any conflicting default A/CNAME records Hostinger created for `@` or `www`.

## 3. Enforce HTTPS

After DNS propagates (minutes to a few hours), return to **Settings → Pages**,
wait for the "DNS check successful" message, then tick **Enforce HTTPS**.
GitHub provisions the TLS certificate automatically.
