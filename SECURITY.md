# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in ICanHazPDF, please report it responsibly.

### How to Report

1. **Do NOT open a public GitHub issue** for security vulnerabilities
2. Email the maintainer directly or use GitHub's private vulnerability reporting feature
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: Within 48 hours of your report
- **Initial Assessment**: Within 1 week
- **Resolution Timeline**: Depends on severity, typically 1-4 weeks

### Scope

Security issues we care about:

- **API vulnerabilities**: Injection attacks, authentication bypasses
- **Data exposure**: Unintended information disclosure
- **Denial of service**: Resource exhaustion attacks
- **Dependency vulnerabilities**: Issues in npm packages we use

### Out of Scope

- Issues in third-party APIs we query (arXiv, Semantic Scholar, etc.)
- Social engineering attacks
- Physical security issues

## Security Best Practices for Self-Hosting

If you're self-hosting ICanHazPDF:

1. **Use HTTPS** in production
2. **Set rate limits** appropriate for your use case
3. **Keep dependencies updated**: Run `npm audit` regularly
4. **Don't expose internal ports** - use a reverse proxy
5. **Set appropriate CORS headers** for your deployment

Thank you for helping keep ICanHazPDF secure!
