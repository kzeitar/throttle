# Rate Limiting vs DoS Protection: Understanding the Difference

## TL;DR

**This library is NOT designed to protect against DDoS attacks.** It's for managing legitimate traffic, enforcing quotas, and preventing abuse from authenticated users. For DDoS protection, use network-level solutions like Cloudflare, NGINX rate limiting, or AWS Shield.

## The Problem with Application-Level DoS Protection

Application-level rate limiting happens in your Node.js process. By the time a request reaches your application:

1. Your server has accepted the TCP connection
2. The HTTP request has been parsed
3. The request has been routed through your middleware stack
4. CPU cycles and memory have been consumed

If someone sends 100,000 requests per second trying to DoS you, your application will attempt to process all of them just to check if they should be rate limited. This defeats the purpose - you're consuming significant resources to protect against resource consumption.

## What This Library Is For

Application-level rate limiting is designed to handle:

### Business Logic Protection
- **User quotas**: Free users get 100 requests/hour, paid users get 1000
- **Tier enforcement**: Different limits for different subscription levels
- **Feature limits**: Premium features have higher limits

### Abuse Prevention
- **Brute force protection**: Limit authentication attempts (5 per 15 minutes)
- **Scraper mitigation**: Prevent users from scraping your entire database
- **API key management**: Enforce limits per API key or OAuth client

### Resource Management
- **Expensive operations**: Limit resource-intensive endpoints (report generation, video processing)
- **Third-party API quotas**: Stay within limits of external services you call
- **Database protection**: Prevent a single user from overwhelming your database

### Fair Usage
- **Prevent monopolization**: One user can't consume all available resources
- **Quality of service**: Ensure reasonable performance for all users
- **Cost control**: Prevent unexpected infrastructure costs from legitimate but excessive use

## What Network-Level Protection Is For

Network and proxy-level rate limiting is designed to handle:

### DDoS Attack Mitigation
- Blocking massive traffic floods (millions of requests per second)
- Distributed attacks from many IPs
- Protocol-level attacks (SYN floods, etc.)

### Traffic Spikes
- Sudden legitimate traffic surges
- Flash crowds
- Viral content scenarios

### Basic Abuse
- Simple repeated requests from single IPs
- Connection flooding
- Bandwidth exhaustion

## Layered Security: The Right Approach

The solution is defense in depth. Here's a recommended architecture:

### Layer 1: Edge Protection (Optional but Recommended)

**Tools**: Cloudflare, AWS Shield, Fastly, Akamai

**What it does**:
- Blocks DDoS attacks before they reach your infrastructure
- Handles millions of requests per second
- Geographic filtering
- Bot detection and mitigation
- SSL/TLS termination

**Cost**: Varies, but often worth it for production applications

**Example configuration** (Cloudflare):
```
Rate limiting rule:
- If requests from single IP > 100/10s
- Then challenge or block for 1 hour
- Apply to: all paths
```

### Layer 2: Reverse Proxy Rate Limiting (Highly Recommended)

**Tools**: NGINX, Caddy, Apache, HAProxy

**What it does**:
- Rejects requests before they reach your application
- Minimal CPU overhead (written in C/Rust)
- Connection-level rate limiting
- Can handle 100k+ requests per second

**NGINX example**:
```nginx
# Define rate limit zone: 10MB memory, max 100 requests/second per IP
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;

server {
    listen 80;
    server_name api.example.com;

    location /api {
        # Allow bursts of up to 20 requests, then enforce limit
        limit_req zone=api_limit burst=20 nodelay;

        # Return 429 on rate limit
        limit_req_status 429;

        proxy_pass http://localhost:3000;
    }
}
```

**Caddy example**:
```caddyfile
api.example.com {
    rate_limit {
        zone api_zone {
            key {remote_host}
            events 100
            window 1s
        }
    }

    reverse_proxy localhost:3000
}
```

### Layer 3: Application-Level Rate Limiting (This Library)

**What it does**:
- Per-user quotas based on subscription tier
- Different limits for different endpoints
- Authentication attempt limiting
- Business rule enforcement

**Example**:
```typescript
import { RateLimiterFactory, InMemoryStorage } from '@zeitar/throttle';

const storage = new InMemoryStorage();

// Strict auth limiting
const authLimiter = new RateLimiterFactory({
  policy: 'sliding_window',
  id: 'auth',
  limit: 5,
  rate: { interval: '15 minutes', amount: 5 }
}, storage);

// Per-tier API limits
const freeTierLimiter = new RateLimiterFactory({
  policy: 'token_bucket',
  id: 'free',
  limit: 100,
  rate: { interval: '1 hour', amount: 100 }
}, storage);

const paidTierLimiter = new RateLimiterFactory({
  policy: 'token_bucket',
  id: 'paid',
  limit: 10000,
  rate: { interval: '1 hour', amount: 10000 }
}, storage);
```

## Real-World Configuration Example

Here's how these layers work together:

```
                    ┌─────────────────────────────────────┐
                    │  Cloudflare (Edge Protection)       │
                    │  - Block obvious attacks            │
                    │  - 100 req/10s per IP globally      │
                    │  - Bot detection                    │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  NGINX (Reverse Proxy)              │
                    │  - 100 req/s per IP                 │
                    │  - Burst: 20                        │
                    │  - Rejects at connection level      │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  Node.js Application                │
                    │  (This Library)                     │
                    │                                     │
                    │  Auth endpoints:                    │
                    │  - 5 attempts / 15 min per user     │
                    │                                     │
                    │  API endpoints (per user):          │
                    │  - Free: 100/hour                   │
                    │  - Pro: 1,000/hour                  │
                    │  - Enterprise: 10,000/hour          │
                    │                                     │
                    │  Expensive operations:              │
                    │  - Report generation: 10/day        │
                    │  - Bulk exports: 1/hour             │
                    └─────────────────────────────────────┘
```

## Why You Need Both

**Network-level protection** is like castle walls:
- Stops armies (DDoS)
- Fast and cheap
- No context about individuals

**Application-level rate limiting** is like guards at the door:
- Checks individual credentials
- Enforces specific rules
- Knows about your business logic

You wouldn't rely on just the walls (armies could still climb over eventually). You wouldn't rely on just the guards (they'd be overwhelmed by an army). You need both.

## Common Misconceptions

### "I have Cloudflare, I don't need application rate limiting"

Wrong. Cloudflare blocks massive attacks, but it doesn't know:
- Which users are on which subscription tier
- That your report generation endpoint is expensive
- That failed login attempts should be limited to 5 per 15 minutes
- Your specific business rules

### "I have application rate limiting, I don't need NGINX limiting"

Also wrong. If someone sends 1 million requests per second, your Node.js app will:
- Try to process each request
- Check rate limits for each one
- Consume CPU and memory
- Likely crash before rate limiting helps

NGINX will reject those requests with minimal overhead.

### "Application rate limiting is useless then"

No. Try implementing these with NGINX alone:
- Free users get 100 API calls/month, paid users get 10,000
- Authentication gets 5 attempts per 15 minutes
- Report generation costs 10 tokens, simple queries cost 1
- Users can "save up" tokens and burst up to their limit

You can't. NGINX doesn't understand your users, tiers, or business logic.

## Performance Impact

Here's the reality of where overhead comes from:

**Cloudflare/Edge**: ~0-1ms (already in the network path)
**NGINX rate limiting**: ~0.1-0.5ms (negligible CPU overhead)
**Application rate limiting** (this library):
- In-memory: ~0.5-1ms
- Redis: ~2-5ms

Under DDoS (100,000 req/s):
- **With only application limiting**: Your servers melt trying to process and rate limit
- **With NGINX + application**: NGINX drops 99% of traffic cheaply, app handles the rest
- **With edge + NGINX + application**: Most traffic never reaches your infrastructure

## When Can You Skip Network-Level Protection?

You might skip network-level protection if:
- You're running a small internal API with trusted users only
- You're in early development and not exposed to the internet
- You're behind a corporate firewall with other protections
- You're okay with the risk and will add it later if needed

But even in these cases, adding basic NGINX rate limiting takes 5 minutes and costs nothing.

## Summary

| Protection Level | Purpose | Handles | Example Tools | Required? |
|-----------------|---------|---------|---------------|-----------|
| Edge | DDoS, massive attacks | Millions req/s | Cloudflare, AWS Shield | Recommended |
| Proxy | Traffic floods, simple abuse | 100k+ req/s | NGINX, Caddy | Highly Recommended |
| Application | Business logic, quotas, fairness | Normal traffic | This library | Yes |

**Bottom line**: Use this library for what it's designed for - managing legitimate users and enforcing business rules. Add network-level protection to handle the attacks and floods that would overwhelm your application before rate limiting could even help.

## Further Reading

- [NGINX Rate Limiting](https://www.nginx.com/blog/rate-limiting-nginx/)
- [Cloudflare Rate Limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [AWS Shield](https://aws.amazon.com/shield/)
- [Caddy Rate Limit Module](https://caddyserver.com/docs/caddyfile/directives/rate_limit)
