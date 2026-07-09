# TLS Certificates

Place `cert.pem` and `key.pem` in this directory for the production nginx
proxy. The proxy's nginx config references them at `/etc/nginx/ssl/`.

## Generate self-signed certs (local/dev)

### OpenSSL (any platform)

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem -out cert.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

### PowerShell (Windows)

```powershell
$cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation Cert:\LocalMachine\My
$pwd = ConvertTo-SecureString -String "password" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath cert.pfx -Password $pwd
openssl pkcs12 -in cert.pfx -out cert.pem -nokeys -passin pass:password
openssl pkcs12 -in cert.pfx -out key.pem -nocerts -nodes -passin pass:password
```

## Production (Let's Encrypt)

Replace with real certs from Certbot or your CA:

```bash
# After pointing your domain at the server:
docker compose -f ../docker-compose.yml -f ../docker-compose.prod.yml run --rm --entrypoint certbot certbot/certbot certonly --webroot -w /var/www/html -d yourdomain.com
```
