# Security

This release defaults to loopback access and disables Python execution. It is intended for trusted local use. Do not expose the Flask development server directly to the Internet.

The Python AST filters and subprocess runner are not a security boundary for untrusted code. A public service needs authentication, rate limits, per-user data isolation and a genuinely isolated execution environment.

Do not publish personal documents, analytics databases, credentials or generated user files. Report vulnerabilities without posting credentials or private data; use GitHub private vulnerability reporting if available, otherwise open an issue containing only a high-level description and request a private reporting channel.
